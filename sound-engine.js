/* ============================================
   SAMA KANE — SOUND ENGINE
   ============================================
   Sophisticated UI sound system with:
   - Preloaded HTMLAudio pools for low latency
   - Polyphony (multiple instances per sound)
   - Per-sound volume balancing
   - Throttling for hover sounds (avoid spam)
   - Mute toggle persisted in localStorage
   - Auto-disable until first user interaction (browser autoplay policy)
   ============================================ */

(function() {
  'use strict';

  // Per-sound volume mix (0-1)
  const VOLUMES = {
    hover: 0.18,
    click: 0.45,
    forward: 0.55,
    back: 0.55,
    photo: 0.4,
    video: 0.55,
    select: 0.4,
    play: 0.45,
    close: 0.4,
  };

  // Pool size — how many simultaneous instances of each sound
  const POOL = {
    hover: 4,
    click: 3,
    forward: 1,
    back: 1,
    photo: 2,
    video: 1,
    select: 2,
    play: 1,
    close: 1,
  };

  // Throttle (ms) — minimum gap between same-sound triggers
  const THROTTLE = {
    hover: 60,
    click: 30,
    select: 40,
  };

  const pools = {};
  const lastPlayed = {};
  let unlocked = false;
  let muted = false;
  let masterVolume = 1.0;

  // Read stored preferences (use try/catch — sandboxed environments may block storage)
  try {
    if (localStorage.getItem('sama_muted') === '1') muted = true;
  } catch (e) {}

  function buildPools() {
    if (typeof SOUND_DATA === 'undefined') {
      console.warn('[Sound] SOUND_DATA not loaded');
      return;
    }
    Object.keys(SOUND_DATA).forEach(name => {
      const size = POOL[name] || 1;
      pools[name] = [];
      for (let i = 0; i < size; i++) {
        const a = new Audio(SOUND_DATA[name]);
        a.preload = 'auto';
        a.volume = (VOLUMES[name] || 0.4) * masterVolume;
        pools[name].push(a);
      }
      lastPlayed[name] = 0;
    });
  }

  // Browser autoplay policy: must wait for user gesture before audio plays
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Touch each audio so future plays don't get blocked
    Object.values(pools).forEach(arr => {
      arr.forEach(a => {
        const p = a.play();
        if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      });
    });
  }

  function play(name) {
    if (muted || !pools[name]) return;
    const now = performance.now();
    const minGap = THROTTLE[name] || 0;
    if (now - lastPlayed[name] < minGap) return;
    lastPlayed[name] = now;

    // Find a free audio element in the pool, or recycle the oldest
    const pool = pools[name];
    let audio = pool.find(a => a.paused || a.ended);
    if (!audio) audio = pool[0];
    try {
      audio.currentTime = 0;
      audio.volume = (VOLUMES[name] || 0.4) * masterVolume;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem('sama_muted', muted ? '1' : '0'); } catch (e) {}
    document.dispatchEvent(new CustomEvent('sound-muted-change', { detail: { muted } }));
  }
  function isMuted() { return muted; }
  function toggleMute() { setMuted(!muted); return muted; }

  // ============================================
  // Auto-wire — attach handlers to elements
  // ============================================
  function autoWire() {
    // Hover sounds: anything with [data-hover] OR a/button
    document.addEventListener('mouseover', e => {
      const target = e.target.closest('[data-hover], a, button');
      if (!target) return;
      // Skip if same as last hover target (prevents re-trigger from child elements)
      if (target === autoWire._lastHover) return;
      autoWire._lastHover = target;
      // Skip elements that have [data-no-hover-sound]
      if (target.hasAttribute('data-no-hover-sound')) return;
      play('hover');
    });
    document.addEventListener('mouseout', e => {
      if (e.target === autoWire._lastHover) autoWire._lastHover = null;
    });

    // Generic click sound — runs in capture phase so it fires before specialized handlers may stop propagation
    document.addEventListener('click', e => {
      const target = e.target.closest(
        '[data-sound], [data-hover], a, button, .gallery-item, .video-card, .track-item, .tool-card, .social-link, .playlist-tab'
      );
      if (!target) return;

      // Element-specific override via data attribute
      const explicit = target.getAttribute('data-sound');
      if (explicit) { play(explicit); return; }

      // Element-class-based routing
      if (target.matches('.video-card, .video-card *')) { play('video'); return; }
      if (target.matches('.gallery-item, .gallery-item *')) { play('photo'); return; }
      if (target.matches('.track-item, .track-item *')) { play('select'); return; }
      if (target.matches('#playBtn, #playBtn *')) { play('play'); return; }
      if (target.matches('#prevBtn, #prevBtn *, #nextBtn, #nextBtn *')) { play('select'); return; }
      if (target.matches('#lightboxClose, #lightboxClose *')) { play('close'); return; }
      if (target.matches('.tool-card, .tool-card *')) { play('click'); return; }
      if (target.matches('.social-link, .social-link *')) { play('click'); return; }
      if (target.matches('.playlist-tab, .playlist-tab *')) { play('select'); return; }
      if (target.matches('.back-link, .back-link *, #returnCta, #returnCta *')) { play('back'); return; }
      if (target.matches('#enterBtn, #enterBtn *')) { play('forward'); return; }

      // Default
      play('click');
    }, true); // capture so it fires reliably even if handlers below stopPropagation

    // Unlock audio on first interaction
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    function once() {
      unlock();
      events.forEach(ev => document.removeEventListener(ev, once, true));
    }
    events.forEach(ev => document.addEventListener(ev, once, true));
  }

  // ============================================
  // Inject mute toggle button
  // ============================================
  function injectMuteButton() {
    const btn = document.createElement('button');
    btn.className = 'sound-toggle';
    btn.setAttribute('aria-label', 'Toggle sound');
    btn.setAttribute('data-no-hover-sound', '');
    btn.innerHTML = `
      <span class="sound-toggle-inner">
        <svg class="icon-sound-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M3 10v4h3l4 3V7L6 10H3z" stroke-linejoin="round"/>
          <path d="M14 8c1.5 1.2 2.5 2.6 2.5 4s-1 2.8-2.5 4" stroke-linecap="round"/>
          <path d="M16.5 5c2.5 1.8 4 4.2 4 7s-1.5 5.2-4 7" stroke-linecap="round"/>
        </svg>
        <svg class="icon-sound-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M3 10v4h3l4 3V7L6 10H3z" stroke-linejoin="round"/>
          <path d="M15 9l5 5M20 9l-5 5" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="sound-toggle-label">Sound</span>
    `;
    btn.addEventListener('click', () => {
      toggleMute();
      btn.classList.toggle('muted', muted);
      // Confirmation chirp when un-muting
      if (!muted) play('select');
    });
    if (muted) btn.classList.add('muted');
    document.body.appendChild(btn);
  }

  // ============================================
  // Public API
  // ============================================
  window.SamaSound = {
    play,
    setMuted,
    isMuted,
    toggleMute,
  };

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      buildPools();
      autoWire();
      injectMuteButton();
    });
  } else {
    buildPools();
    autoWire();
    injectMuteButton();
  }
})();
