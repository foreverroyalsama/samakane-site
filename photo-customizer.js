/* ============================================
   SAMA KANE — PHOTO CUSTOMIZER (with BG removal)
   ============================================
   - Floating "Edit Photo" button → modal panel
   - Upload via drag-drop or browse
   - Toggle: With background / Without background
   - Background removal runs entirely in the browser
     using @imgly/background-removal (loaded on demand)
   - Live preview with vertical position slider
   - localStorage persistence (image + position + bg-removed flag)
   - Reset to default
   ============================================ */

(function() {
  'use strict';

  const STORAGE_KEY = 'sama_portrait_v3';
  const POSITION_KEY = 'sama_portrait_position_v3';
  const NOBG_KEY = 'sama_portrait_nobg_v3';

  const DEFAULT_WITH_BG = 'portrait-hero.jpg';
  const DEFAULT_NO_BG = 'portrait-hero-nobg.jpg';

  let bgRemovalLib = null;
  let bgRemovalLoading = null;

  function applyStoredPortrait() {
    let stored = null;
    let position = '50% 50%';
    let useNoBg = false;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
      const pos = localStorage.getItem(POSITION_KEY);
      if (pos) position = pos;
      useNoBg = localStorage.getItem(NOBG_KEY) === '1';
    } catch (e) {}

    const heroImgs = document.querySelectorAll('.hero-portrait img, .uh-portrait img');
    heroImgs.forEach(img => {
      if (stored) {
        img.src = stored;
      } else {
        // Default to no-bg for that "floating" cinematic look
        img.src = useNoBg === false ? DEFAULT_WITH_BG : DEFAULT_NO_BG;
      }
      // Only set objectPosition on the main hero (not the ghost on universe page)
      if (img.closest('.hero-portrait')) {
        img.style.objectPosition = position;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyStoredPortrait);
  } else {
    applyStoredPortrait();
  }

  // Lazy-load the background removal pipeline using Transformers.js (Hugging Face)
  // This loads the RMBG-1.4 model — small, fast, and reliable in browsers
  function loadBgRemoval() {
    if (bgRemovalLib) return Promise.resolve(bgRemovalLib);
    if (bgRemovalLoading) return bgRemovalLoading;

    bgRemovalLoading = new Promise((resolve, reject) => {
      // Use a module script to dynamically import Transformers.js from CDN
      const script = document.createElement('script');
      script.type = 'module';
      // We pre-build the pipeline and expose a function to remove bg
      script.textContent = `
        try {
          const { AutoModel, AutoProcessor, RawImage, env } =
            await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');

          // Allow remote model downloads, disable local file lookups
          env.allowLocalModels = false;

          // Load model + processor (cached after first download)
          const modelId = 'briaai/RMBG-1.4';
          const model = await AutoModel.from_pretrained(modelId, {
            // Use fp32 for max compatibility with WebGPU/WASM
            config: { model_type: 'custom' }
          });
          const processor = await AutoProcessor.from_pretrained(modelId, {
            config: {
              do_normalize: true,
              do_pad: false,
              do_rescale: true,
              do_resize: true,
              image_mean: [0.5, 0.5, 0.5],
              feature_extractor_type: 'ImageFeatureExtractor',
              image_std: [1, 1, 1],
              resample: 2,
              rescale_factor: 0.00392156862745098,
              size: { width: 1024, height: 1024 },
            }
          });

          // Wrapper function: takes an HTMLImageElement or Blob, returns a Blob
          window.__samaRemoveBg = async function(imageBlob) {
            const url = URL.createObjectURL(imageBlob);
            try {
              const image = await RawImage.fromURL(url);
              const { pixel_values } = await processor(image);
              const { output } = await model({ input: pixel_values });

              // Resize the predicted mask to original image size
              const maskRaw = await RawImage.fromTensor(output[0].mul(255).to('uint8'));
              const mask = await maskRaw.resize(image.width, image.height);

              // Composite: draw original image then apply mask as alpha
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              const ctx = canvas.getContext('2d');

              // Draw original image
              const imgEl = await new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = url;
              });
              ctx.drawImage(imgEl, 0, 0);

              // Apply mask to alpha channel
              const pixelData = ctx.getImageData(0, 0, image.width, image.height);
              const maskData = mask.data;
              for (let i = 0; i < maskData.length; ++i) {
                pixelData.data[4 * i + 3] = maskData[i];
              }
              ctx.putImageData(pixelData, 0, 0);

              return await new Promise(res => canvas.toBlob(res, 'image/png'));
            } finally {
              URL.revokeObjectURL(url);
            }
          };

          window.dispatchEvent(new CustomEvent('bgremoval-ready'));
        } catch (err) {
          window.__samaBgRemovalError = err;
          window.dispatchEvent(new CustomEvent('bgremoval-error', { detail: err }));
        }
      `;

      const onReady = () => {
        cleanup();
        bgRemovalLib = { remove: window.__samaRemoveBg };
        resolve(bgRemovalLib);
      };
      const onError = (e) => {
        cleanup();
        const err = window.__samaBgRemovalError || e.detail || new Error('Failed to load AI model');
        reject(new Error(err.message || 'Could not load background removal model. Check your internet connection.'));
      };
      const cleanup = () => {
        window.removeEventListener('bgremoval-ready', onReady);
        window.removeEventListener('bgremoval-error', onError);
      };
      window.addEventListener('bgremoval-ready', onReady);
      window.addEventListener('bgremoval-error', onError);

      // Hard timeout (model is ~85MB, allow up to 90s on slow connections)
      setTimeout(() => {
        if (!bgRemovalLib) {
          cleanup();
          reject(new Error('Loading timed out. Try again or check your connection.'));
        }
      }, 120000);

      document.head.appendChild(script);
    });

    return bgRemovalLoading;
  }

  function injectUI() {
    const btn = document.createElement('button');
    btn.className = 'photo-edit-btn';
    btn.setAttribute('aria-label', 'Change photo');
    btn.setAttribute('data-no-hover-sound', '');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M3 7h3l2-2h8l2 2h3v12H3z" stroke-linejoin="round"/>
        <circle cx="12" cy="13" r="4"/>
        <circle cx="12" cy="13" r="1.5" fill="currentColor"/>
      </svg>
      <span class="photo-edit-label">Edit Photo</span>
    `;
    btn.addEventListener('click', openModal);
    document.body.appendChild(btn);

    const modal = document.createElement('div');
    modal.className = 'photo-modal';
    modal.innerHTML = `
      <div class="photo-modal-panel">
        <button class="photo-modal-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="photo-modal-eyebrow">— Customize —</div>
        <h3 class="photo-modal-title">Change <em>Portrait</em></h3>
        <p class="photo-modal-desc">Upload an image. Choose to keep its background or remove it for a floating effect.</p>

        <div class="photo-dropzone" id="photoDropzone">
          <input type="file" id="photoFileInput" accept="image/*" hidden />
          <div class="photo-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="photo-dropzone-icon">
              <path d="M12 16V4M6 10l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" stroke-linecap="round"/>
            </svg>
            <div class="photo-dropzone-text">Drop image here or <span>browse files</span></div>
            <div class="photo-dropzone-hint">JPG, PNG, or WEBP · max 20MB</div>
          </div>
        </div>

        <div class="bg-toggle-wrap" id="bgToggleWrap" hidden>
          <div class="bg-toggle-label">Background</div>
          <div class="bg-toggle">
            <button class="bg-toggle-opt active" data-mode="with" data-hover>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="1"/>
                <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
                <path d="M3 17l5-5 4 4 3-3 6 6" stroke-linejoin="round"/>
              </svg>
              <span>Keep</span>
            </button>
            <button class="bg-toggle-opt" data-mode="without" data-hover>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 3a9 9 0 110 18 9 9 0 010-18z" stroke-dasharray="2 3"/>
                <circle cx="12" cy="10" r="3"/>
                <path d="M6 19c1.5-3 3.5-4 6-4s4.5 1 6 4"/>
              </svg>
              <span>Remove</span>
            </button>
          </div>
          <div class="bg-toggle-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.01" stroke-linecap="round"/></svg>
            <span>First-time use downloads an AI model (~85MB). Cached locally for instant future use.</span>
          </div>
        </div>

        <div class="bg-processing" id="bgProcessing" hidden>
          <div class="bg-processing-spinner"></div>
          <div class="bg-processing-label" id="bgProcessingLabel">Removing background...</div>
          <div class="bg-processing-hint" id="bgProcessingHint">First time may take 30-60 seconds while model downloads</div>
        </div>

        <div class="photo-preview-wrap" id="photoPreviewWrap" hidden>
          <div class="photo-preview" id="photoPreview"></div>
          <div class="photo-position-row">
            <label class="photo-position-label">Vertical position</label>
            <input type="range" id="photoPositionSlider" min="0" max="100" value="50" />
          </div>
        </div>

        <div class="photo-modal-actions">
          <button class="photo-btn photo-btn-secondary" id="photoResetBtn" data-hover>Reset to default</button>
          <button class="photo-btn photo-btn-primary" id="photoSaveBtn" data-hover disabled>Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const dropzone = modal.querySelector('#photoDropzone');
    const fileInput = modal.querySelector('#photoFileInput');
    const previewWrap = modal.querySelector('#photoPreviewWrap');
    const preview = modal.querySelector('#photoPreview');
    const slider = modal.querySelector('#photoPositionSlider');
    const saveBtn = modal.querySelector('#photoSaveBtn');
    const resetBtn = modal.querySelector('#photoResetBtn');
    const closeBtn = modal.querySelector('.photo-modal-close');
    const bgToggleWrap = modal.querySelector('#bgToggleWrap');
    const bgToggleOpts = modal.querySelectorAll('.bg-toggle-opt');
    const bgProcessing = modal.querySelector('#bgProcessing');
    const bgProcessingLabel = modal.querySelector('#bgProcessingLabel');

    let originalDataURL = null;
    let cutoutDataURL = null;
    let currentMode = 'with';
    let pendingDataURL = null;
    let pendingNoBg = false;

    try {
      const storedPos = localStorage.getItem(POSITION_KEY);
      if (storedPos) {
        const m = storedPos.match(/(\d+)%\s+(\d+)%/);
        if (m) slider.value = m[2];
      }
    } catch (e) {}

    function openModal() {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (window.SamaSound) window.SamaSound.play('photo');
    }
    function closeModal() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      originalDataURL = null;
      cutoutDataURL = null;
      pendingDataURL = null;
      currentMode = 'with';
      bgToggleWrap.hidden = true;
      previewWrap.hidden = true;
      bgProcessing.hidden = true;
      saveBtn.disabled = true;
      preview.style.backgroundImage = '';
      bgToggleOpts.forEach(o => o.classList.toggle('active', o.dataset.mode === 'with'));
      if (window.SamaSound) window.SamaSound.play('close');
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });
    ['dragenter', 'dragover'].forEach(ev => {
      dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(ev => {
      dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    function handleFile(file) {
      if (!file.type.startsWith('image/')) { flashToast('Please select an image file', true); return; }
      if (file.size > 20 * 1024 * 1024) { flashToast('Image must be smaller than 20MB', true); return; }

      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1600;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          originalDataURL = canvas.toDataURL('image/jpeg', 0.88);
          cutoutDataURL = null;
          currentMode = 'with';
          pendingDataURL = originalDataURL;
          pendingNoBg = false;
          bgToggleOpts.forEach(o => o.classList.toggle('active', o.dataset.mode === 'with'));
          bgToggleWrap.hidden = false;
          showPreview();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    bgToggleOpts.forEach(opt => {
      opt.addEventListener('click', () => {
        if (!originalDataURL) return;
        const mode = opt.dataset.mode;
        if (mode === currentMode) return;
        bgToggleOpts.forEach(o => o.classList.toggle('active', o === opt));
        currentMode = mode;
        if (window.SamaSound) window.SamaSound.play('select');

        if (mode === 'with') {
          pendingDataURL = originalDataURL;
          pendingNoBg = false;
          showPreview();
        } else {
          if (cutoutDataURL) {
            pendingDataURL = cutoutDataURL;
            pendingNoBg = true;
            showPreview();
          } else {
            removeBackground();
          }
        }
      });
    });

    async function removeBackground() {
      previewWrap.hidden = true;
      bgProcessing.hidden = false;
      saveBtn.disabled = true;
      bgProcessingLabel.textContent = 'Loading AI model...';

      try {
        const lib = await loadBgRemoval();
        bgProcessingLabel.textContent = 'Removing background...';

        // Convert original data URL to a blob
        const response = await fetch(originalDataURL);
        const blob = await response.blob();

        // Run removal — returns a PNG blob with alpha
        const resultBlob = await lib.remove(blob);

        // Convert to data URL for storage and preview
        const resultURL = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(resultBlob);
        });

        cutoutDataURL = resultURL;
        pendingDataURL = cutoutDataURL;
        pendingNoBg = true;
        bgProcessing.hidden = true;
        showPreview();
        if (window.SamaSound) window.SamaSound.play('forward');
      } catch (err) {
        console.error('BG removal failed:', err);
        bgProcessing.hidden = true;
        flashToast(err.message || 'Background removal failed', true);
        currentMode = 'with';
        bgToggleOpts.forEach(o => o.classList.toggle('active', o.dataset.mode === 'with'));
        pendingDataURL = originalDataURL;
        pendingNoBg = false;
        showPreview();
      }
    }

    function showPreview() {
      preview.style.backgroundImage = `url('${pendingDataURL}')`;
      preview.style.backgroundPosition = `50% ${slider.value}%`;
      preview.classList.toggle('checkered', pendingNoBg);
      previewWrap.hidden = false;
      saveBtn.disabled = false;
    }

    slider.addEventListener('input', () => {
      preview.style.backgroundPosition = `50% ${slider.value}%`;
    });

    saveBtn.addEventListener('click', () => {
      if (!pendingDataURL) return;
      try {
        localStorage.setItem(STORAGE_KEY, pendingDataURL);
        localStorage.setItem(POSITION_KEY, `50% ${slider.value}%`);
        localStorage.setItem(NOBG_KEY, pendingNoBg ? '1' : '0');
        applyStoredPortrait();
        flashToast('Photo saved');
        if (window.SamaSound) window.SamaSound.play('forward');
        setTimeout(closeModal, 700);
      } catch (e) {
        flashToast('Could not save — image may be too large for storage', true);
      }
    });

    resetBtn.addEventListener('click', () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(POSITION_KEY);
        localStorage.removeItem(NOBG_KEY);
      } catch (e) {}
      const heroImgs = document.querySelectorAll('.hero-portrait img, .uh-portrait img');
      heroImgs.forEach(img => {
        img.src = DEFAULT_NO_BG + '?' + Date.now();
        if (img.closest('.hero-portrait')) {
          img.style.objectPosition = '50% 50%';
        }
      });
      slider.value = 50;
      originalDataURL = null;
      cutoutDataURL = null;
      pendingDataURL = null;
      bgToggleWrap.hidden = true;
      previewWrap.hidden = true;
      saveBtn.disabled = true;
      preview.style.backgroundImage = '';
      currentMode = 'with';
      bgToggleOpts.forEach(o => o.classList.toggle('active', o.dataset.mode === 'with'));
      if (window.SamaSound) window.SamaSound.play('back');
      flashToast('Reset to default photo');
    });

    function flashToast(msg, isError) {
      let toast = document.querySelector('.photo-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'photo-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.toggle('error', !!isError);
      toast.classList.add('show');
      clearTimeout(flashToast._t);
      flashToast._t = setTimeout(() => toast.classList.remove('show'), 2400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }
})();
