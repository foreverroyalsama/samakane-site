/* ============================================
   SAMA KANE — MEDIA MANAGER
   ============================================
   IndexedDB-backed gallery & video storage.
   - Gigabyte capacity (handles HD videos)
   - Drag-and-drop multi-upload
   - Persist across sessions
   - Per-item delete on hover
   - Public API: window.SamaMedia
   ============================================ */

(function() {
  'use strict';

  const DB_NAME = 'sama_media';
  const DB_VERSION = 1;
  const STORE_PHOTOS = 'photos';
  const STORE_VIDEOS = 'videos';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
          db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const result = fn(store);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
    });
  }

  async function listAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readonly');
      const req = t.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.order - b.order));
      req.onerror = () => reject(req.error);
    });
  }

  async function addItem(storeName, item) {
    return tx(storeName, 'readwrite', store => store.put(item));
  }

  async function deleteItem(storeName, id) {
    return tx(storeName, 'readwrite', store => store.delete(id));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ============================================
  // Image processing — resize for storage efficiency
  // ============================================
  async function processImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => {
            // Also generate thumbnail for fast gallery rendering
            const thumbMax = 600;
            let tw = w, th = h;
            if (tw > thumbMax || th > thumbMax) {
              const r = Math.min(thumbMax / tw, thumbMax / th);
              tw = Math.round(tw * r); th = Math.round(th * r);
            }
            const tcanvas = document.createElement('canvas');
            tcanvas.width = tw; tcanvas.height = th;
            tcanvas.getContext('2d').drawImage(img, 0, 0, tw, th);
            tcanvas.toBlob(thumbBlob => {
              resolve({ full: blob, thumb: thumbBlob, width: w, height: h });
            }, 'image/jpeg', 0.82);
          }, 'image/jpeg', 0.88);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ============================================
  // Video processing — generate thumbnail from first frame
  // ============================================
  async function processVideo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = () => {
        // Seek to ~1 second in to skip black intro frames
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      video.onseeked = () => {
        const maxDim = 800;
        let w = video.videoWidth, h = video.videoHeight;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        canvas.toBlob(thumbBlob => {
          URL.revokeObjectURL(url);
          resolve({
            full: file,
            thumb: thumbBlob,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration
          });
        }, 'image/jpeg', 0.85);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read video'));
      };
    });
  }

  // ============================================
  // Public API
  // ============================================
  async function addPhotos(files) {
    const results = [];
    let order = Date.now();
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 20 * 1024 * 1024) {
        console.warn(`Skipping ${file.name}: too large`);
        continue;
      }
      try {
        const processed = await processImage(file);
        const item = {
          id: uid(),
          name: file.name,
          full: processed.full,
          thumb: processed.thumb,
          width: processed.width,
          height: processed.height,
          order: order++,
          added: Date.now()
        };
        await addItem(STORE_PHOTOS, item);
        results.push(item);
      } catch (err) {
        console.error('Photo processing failed:', file.name, err);
      }
    }
    document.dispatchEvent(new CustomEvent('sama-photos-changed'));
    return results;
  }

  async function addVideos(files) {
    const results = [];
    let order = Date.now();
    for (const file of files) {
      if (!file.type.startsWith('video/')) continue;
      if (file.size > 200 * 1024 * 1024) {
        console.warn(`Skipping ${file.name}: over 200MB`);
        continue;
      }
      try {
        const processed = await processVideo(file);
        const item = {
          id: uid(),
          name: file.name.replace(/\.[^.]+$/, ''),
          full: processed.full,
          thumb: processed.thumb,
          width: processed.width,
          height: processed.height,
          duration: processed.duration,
          mime: file.type,
          order: order++,
          added: Date.now()
        };
        await addItem(STORE_VIDEOS, item);
        results.push(item);
      } catch (err) {
        console.error('Video processing failed:', file.name, err);
      }
    }
    document.dispatchEvent(new CustomEvent('sama-videos-changed'));
    return results;
  }

  async function getPhotos() { return await listAll(STORE_PHOTOS); }
  async function getVideos() { return await listAll(STORE_VIDEOS); }

  async function deletePhoto(id) {
    await deleteItem(STORE_PHOTOS, id);
    document.dispatchEvent(new CustomEvent('sama-photos-changed'));
  }
  async function deleteVideo(id) {
    await deleteItem(STORE_VIDEOS, id);
    document.dispatchEvent(new CustomEvent('sama-videos-changed'));
  }

  function blobToURL(blob) { return URL.createObjectURL(blob); }

  function formatDuration(s) {
    if (!s || isNaN(s)) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  window.SamaMedia = {
    addPhotos, addVideos,
    getPhotos, getVideos,
    deletePhoto, deleteVideo,
    blobToURL, formatDuration,
  };
})();
