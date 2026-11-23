/* AI ULTRA MUSICFES 2026 / UI controller (classic script, no modules).
 * Loads last, after festival-data.js, audio-engine.js, motion-atlas-core.js and stage-canvas.js.
 * Stage, hall and schedule state live here. Transport state is read back from the audio engine. */
(function (global) {
  'use strict';

  const ns = (global.AIUMF = global.AIUMF || {});
  const doc = global.document;
  const root = doc.documentElement;

  const SCHEDULE_KEY = 'aiumf_2026_schedule';
  const DEFAULT_HANDLE = 'GUEST-01';
  const HANDLE_MAX = 14;
  const DELAY_MAX = 0.28;
  const POLL_ACTIVE_MS = 100;
  const POLL_IDLE_MS = 500;
  const FONT_PROBES = [
    { id: 'archivo', family: 'Archivo', weight: 900, fallback: 'sans-serif', sample: 'AI ULTRA MUSICFES 2026' },
    { id: 'mplus', family: 'M PLUS 1 Code', weight: 500, fallback: 'monospace', sample: '東京湾岸特設ドーム 128.0' },
    { id: 'dela', family: 'Dela Gothic One', weight: 400, fallback: 'sans-serif', sample: '響鳴電脳祭' }
  ];

  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const pad2 = n => String(n).padStart(2, '0');

  function byId(id) {
    const node = doc.getElementById(id);
    if (!node) throw new Error('AIUMF UI is missing #' + id);
    return node;
  }

  function h(tag, props, children) {
    const node = doc.createElement(tag);
    Object.keys(props || {}).forEach(key => {
      const value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.style.cssText = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach(child => {
      if (child) node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    });
    return node;
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function fmtBpm(bpm) {
    const n = Number(bpm);
    return Number.isInteger(n * 10) ? n.toFixed(1) : n.toFixed(2);
  }

  function fmtClock(seconds) {
    const tenths = Math.floor(Math.max(0, Number(seconds) || 0) * 10 + 1e-6);
    return pad2(Math.floor(tenths / 600)) + ':' + pad2(Math.floor(tenths / 10) % 60) + '.' + (tenths % 10);
  }

  const fmtKb = bytes => (bytes / 1000).toFixed(1) + ' KB';
  const fmtHz = hz => (hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : String(Math.round(hz)));
  const inkStyle = stage => '--ink:' + stage.dayInk + ';--ink-text:' + stage.dayPlateText;

  function parseColor(value) {
    const text = String(value || '').trim();
    let match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (match) {
      const hex = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    }
    match = /^(rgba?|color)\(([^)]+)\)$/i.exec(text);
    if (!match) return null;
    const unit = match[1].toLowerCase() === 'color' ? 255 : 1;
    const parts = match[2].replace(/^srgb\s+/i, '').split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
    return parts.map(n => clamp(Math.round(n * unit), 0, 255));
  }

  const toHex = rgb => '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();

  // WCAG 2.1 relative luminance and contrast ratio.
  function luminance(rgb) {
    const lin = rgb.map(n => {
      const c = n / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const wcagGrade = ratio => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA LARGE' : 'FAIL');

  // Count pixels that differ between the web font and its generic fallback.
  function inkDiff(probe) {
    const width = 420;
    const height = 80;
    const draw = font => {
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.font = font;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000';
      ctx.fillText(probe.sample, 6, 58);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const face = draw(probe.weight + ' 48px "' + probe.family + '", ' + probe.fallback);
    const base = draw(probe.weight + ' 48px ' + probe.fallback);
    let count = 0;
    for (let i = 3; i < face.length; i += 4) {
      if (Math.abs(face[i] - base[i]) > 48) count += 1;
    }
    return count;
  }

  function report(message, error) {
    if (global.console) global.console.error('[AIUMF] ' + message, error || '');
  }

  // The three engines are built separately, so a missing or throwing one must not take the poster down.
  function construct(name, build) {
    const Ctor = ns[name];
    try {
      if (typeof Ctor === 'function') return build(Ctor);
      report(name + ' is not loaded');
    } catch (error) {
      report(name + ' failed to start', error);
    }
    return null;
  }

  function invoke(target, method) {
    if (!target || typeof target[method] !== 'function') return undefined;
    try {
      return target[method].apply(target, Array.prototype.slice.call(arguments, 2));
    } catch (error) {
      report(method + ' failed', error);
      return undefined;
    }
  }

  function loadSchedule(validIds) {
    try {
      const raw = JSON.parse(global.localStorage.getItem(SCHEDULE_KEY) || '[]');
      return new Set((Array.isArray(raw) ? raw : []).filter(id => validIds.has(id)));
    } catch (_error) {
      return new Set();
    }
  }

  function saveSchedule(ids) {
    try {
      global.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(Array.from(ids)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function sanitizeHandle(raw) {
    return String(raw).toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/-{2,}/g, '-').slice(0, HANDLE_MAX);
  }

  function boot() {
    const DATA = ns.DATA;
    if (!DATA || !Array.isArray(DATA.stages) || !DATA.stages.length) {
      root.dataset.app = 'failed';
      report('festival-data.js did not load');
      return;
    }

    const stages = DATA.stages;
    const allStage = DATA.allStage;
    const stageById = new Map(stages.map(stage => [stage.id, stage]));
    const dayKeys = Object.keys(DATA.timetable);
    const acts = dayKeys.reduce((list, day) => list.concat(DATA.timetable[day]), []);
    const railOrder = stages.map(stage => stage.id).concat(allStage.id);

    const el = {
      themeColor: byId('theme-color'),
      appStatus: byId('app-status'),
      contrastBar: byId('contrast-bar'),
      fontStamp: byId('font-proof-stamp'),
      motionBtn: byId('motion-toggle-btn'),
      hallBtn: byId('hall-toggle-btn'),
      sfxBtn: byId('sfx-toggle-btn'),
      poster: byId('poster'),
      posterField: byId('poster-field'),
      rail: byId('kanji-rail'),
      railSlug: byId('rail-slug'),
      billing: byId('hero-billing'),
      heroChip: byId('hero-stage-chip'),
      heroStageName: byId('hero-stage-name'),
      heroArtistJa: byId('hero-artist-ja'),
      heroArtistEn: byId('hero-artist-en'),
      heroRole: byId('hero-role'),
      heroTime: byId('hero-set-time'),
      heroBpm: byId('hero-bpm'),
      heroKey: byId('hero-key'),
      heroPlay: byId('hero-play-btn'),
      heroPlayLabel: byId('hero-play-label'),
      heroPlaySub: byId('hero-play-sub'),
      heroStatus: byId('hero-audio-status'),
      lock: byId('character-lock'),
      plateKanji: byId('hero-plate-kanji'),
      heroImg: byId('hero-character-img'),
      stageTag: byId('hero-stage-tag'),
      band: byId('transport-band'),
      playBtn: byId('transport-play-btn'),
      tally: byId('transport-tally'),
      nowStage: byId('transport-now-stage'),
      nowArtist: byId('transport-now-artist'),
      elapsed: byId('transport-elapsed'),
      duration: byId('transport-duration'),
      seek: byId('transport-seek'),
      loopRegion: byId('transport-loop-region'),
      djBtn: byId('transport-dj-btn'),
      loopBtn: byId('transport-loop-btn'),
      filter: byId('dj-filter'),
      filterValue: byId('dj-filter-value'),
      delay: byId('dj-delay'),
      delayValue: byId('dj-delay-value'),
      master: byId('dj-master'),
      masterValue: byId('dj-master-value'),
      bandSfxBtn: byId('transport-sfx-btn'),
      liveState: byId('console-live-state'),
      liveBar: byId('console-live-bar'),
      liveDeck: byId('console-live-deck'),
      consoleChip: byId('console-stage-chip'),
      consoleStageName: byId('console-stage-name'),
      vocalBadge: byId('console-vocal-badge'),
      genre: byId('console-genre'),
      lyrics: byId('console-lyrics'),
      stylePrompt: byId('console-style-prompt'),
      dossierGrid: byId('dossier-grid'),
      timetable: byId('timetable'),
      ttTitle: byId('timetable-title'),
      ttDays: byId('timetable-days'),
      ttStages: byId('timetable-stages'),
      ttMine: byId('my-schedule-filter-btn'),
      ttCount: byId('my-schedule-count'),
      ttStatus: byId('timetable-status'),
      ttList: byId('timetable-list'),
      passInput: byId('pass-handle-input'),
      passStamps: byId('pass-stamp-options'),
      passFile: byId('pass-file-name'),
      passStatus: byId('pass-status'),
      passTilt: byId('pass-tilt'),
      passCanvas: byId('pass-canvas'),
      passBtn: byId('pass-download-btn'),
      dialog: byId('colophon-dialog'),
      colophonBody: byId('colophon-body')
    };
    const railButtons = new Map(railOrder.map(id => [id, byId('rail-btn-' + id)]));
    const consoleCell = {};
    ['bpm-measured', 'bpm-prompt', 'key', 'lufs', 'dbtp', 'seed', 'length', 'loop-label', 'loop', 'delay-time'].forEach(key => {
      consoleCell[key] = byId('console-' + key);
    });

    const state = {
      stageId: stages[0].id,
      sai: false,
      hall: 'day',
      hallSource: 'manual',
      motion: true,
      sfx: true,
      loop: false,
      filter: 0,
      delay: 0,
      master: 0.8,
      tt: { day: dayKeys[0], stage: 'all', mineOnly: false },
      bookmarks: loadSchedule(new Set(acts.map(act => act.id))),
      schedulePersisted: true,
      pass: { handle: DEFAULT_HANDLE, stageId: stages[0].id, pinned: false, tiltX: 0, tiltY: 0 },
      fonts: { status: 'checking', loaded: 0, total: FONT_PROBES.length, overflowPx: 0, probes: [] },
      contrast: null
    };

    let transport = { state: 'idle', time: 0, duration: stages[0].durationSec, deck: 'A', stageId: stages[0].id, unlocked: false };
    let transportActive = false;
    let pollTimer = 0;
    let lightsUpTimer = 0;
    let contrastTimer = 0;
    let spotlitTimer = 0;
    let sfxTypingTimer = 0;
    let scrubbing = false;
    let spotTarget = null;
    let scrollQueued = false;

    const activeStage = () => stageById.get(state.stageId);
    const stageView = () => (state.sai ? allStage : activeStage());
    const beatMs = () => 60000 / activeStage().measuredBpm;
    const announce = text => setText(el.appStatus, text);

    // Decoding all four cutouts up front makes a stage switch swap the art on the same frame as its wipe.
    const preloaded = stages.map(stage => {
      const image = new global.Image();
      image.src = ns.resolveAsset(stage.webpPath);
      return image;
    });
    showCharacter(stages[0]);

    const audioEngine = construct('FestivalAudioEngine', Ctor => new Ctor(DATA));
    const motionEngine = construct('MotionEngine', Ctor => new Ctor({ respectReducedMotion: true }));
    const stageCanvas = construct('StageCanvasSystem', Ctor => new Ctor({
      data: DATA,
      motionEngine: motionEngine,
      audioEngine: audioEngine,
      elements: {
        heroBackCanvas: byId('hero-back-canvas'),
        heroMaskCanvas: byId('hero-mask-canvas'),
        heroWipeCanvas: byId('hero-wipe-canvas'),
        heroImgEl: el.heroImg,
        scopeCanvas: byId('console-scope-canvas'),
        passCanvas: el.passCanvas
      }
    }));

    const sfx = (id, rate) => invoke(audioEngine, 'playSfx', id, { rate: rate || 1 });

    /* ---------- Stage and hall ---------- */

    function showCharacter(stage) {
      if (el.heroImg.dataset.asset !== stage.webpPath) {
        el.heroImg.dataset.asset = stage.webpPath;
        el.heroImg.src = ns.resolveAsset(stage.webpPath);
      }
      el.heroImg.alt = stage.artistJa + ' ' + stage.artistEn + ', ' + stage.role;
    }

    function billingModel() {
      const stage = activeStage();
      if (!state.sai) {
        return {
          chip: 'STAGE ' + stage.num,
          name: stage.kanji + ' ' + stage.code + ' / ' + stage.stageName,
          artistJa: stage.artistJa,
          artistEn: stage.artistEn,
          role: stage.role + ' / ' + stage.genre,
          time: stage.setTime,
          stampA: 'BPM ' + fmtBpm(stage.measuredBpm),
          stampB: 'KEY ' + stage.measuredKey,
          tag: stage.stageName,
          slug: 'STAGE ' + stage.num + ' / ' + stage.stageName.toUpperCase()
        };
      }
      return {
        chip: 'STAGE ' + allStage.num,
        name: allStage.kanji + ' ' + allStage.code + ' / ' + allStage.stageName,
        artistJa: DATA.festival.titleJa,
        artistEn: 'All headliners',
        role: stages.map(s => s.artistEn).join(' / '),
        time: DATA.festival.dates,
        stampA: stages.length + ' STAGES',
        stampB: acts.length + ' ACTS',
        tag: 'All stages',
        slug: 'ALL STAGES / ' + DATA.festival.datesShort
      };
    }

    function replay(node, className) {
      if (!state.motion) return;
      node.classList.remove(className);
      void node.offsetWidth;
      node.classList.add(className);
      node.addEventListener('animationend', () => node.classList.remove(className), { once: true });
    }

    function renderStage(animate) {
      const stage = activeStage();
      const view = stageView();
      const model = billingModel();

      root.dataset.stage = view.id;
      root.style.setProperty('--bpm', String(stage.measuredBpm));
      root.style.setProperty('--stage-ink', view.dayInk);
      root.style.setProperty('--stage-plate-text', view.dayPlateText);
      root.style.setProperty('--stage-night-bg', view.nightBg);
      root.style.setProperty('--stage-night-light', view.nightLight);
      root.style.setProperty('--stage-emissive', view.emissiveHex || stage.emissiveHex);
      root.style.setProperty('--screen-angle', stage.screenAngle + 'deg');
      el.lock.dataset.screen = stage.screenKind;
      el.themeColor.content = state.hall === 'night' ? view.nightBg : DATA.festival.paper;

      railButtons.forEach((button, id) => {
        const pressed = id === view.id;
        if (pressed && animate && button.getAttribute('aria-pressed') !== 'true') replay(button, 'is-flap');
        button.setAttribute('aria-pressed', String(pressed));
      });

      setText(el.heroChip, model.chip);
      setText(el.heroStageName, model.name);
      setText(el.heroArtistJa, model.artistJa);
      setText(el.heroArtistEn, model.artistEn);
      setText(el.heroRole, model.role);
      setText(el.heroTime, model.time);
      setText(el.heroBpm, model.stampA);
      setText(el.heroKey, model.stampB);
      setText(el.stageTag, model.tag);
      setText(el.railSlug, model.slug);
      setText(el.plateKanji, view.kanji);
      showCharacter(stage);
      if (animate) Array.from(el.billing.children).forEach(node => replay(node, 'is-mekuri'));

      setText(el.heroPlaySub, stage.num + ' ' + stage.kanji + ' ' + stage.code + ' · BPM ' + fmtBpm(stage.measuredBpm));
      setText(el.nowStage, stage.num + ' ' + stage.kanji + ' ' + stage.code);
      setText(el.nowArtist, stage.artistJa);
      renderConsole(stage);
      el.dossierGrid.querySelectorAll('.plate').forEach(plate => {
        plate.dataset.active = String(!state.sai && plate.dataset.stageId === stage.id);
      });
      renderStamps();
      global.requestAnimationFrame(measureOverflow);
    }

    function routeAudio(id, play) {
      if (!audioEngine) return;
      // A stage change while the first buffer is still decoding would cancel the pending play, so re-issue it.
      const keepPlaying = play || readTransport().state === 'loading';
      if (play) {
        setText(el.heroStatus, '');
        setHall('night', 'transport');
      }
      Promise.resolve(invoke(audioEngine, keepPlaying ? 'play' : 'switchStage', id)).catch(onAudioError);
      poll();
    }

    function setStage(id, options) {
      const opts = options || {};
      if (id === allStage.id) return setSai(true, opts);
      if (!stageById.has(id)) return false;
      const changed = id !== state.stageId || state.sai;
      const deckMismatch = Boolean(audioEngine) && readTransport().stageId !== id;
      if (changed) {
        state.stageId = id;
        state.sai = false;
        if (!state.pass.pinned) state.pass.stageId = id;
        renderStage(true);
        invoke(stageCanvas, 'setStageModeSai', false);
        invoke(stageCanvas, 'setStage', id, { animate: opts.animate !== false });
        syncPass();
        sfx('stage_switch');
        const stage = activeStage();
        announce('Stage ' + stage.num + ' ' + stage.kanji + ' ' + stage.code + ', ' + stage.stageName + ', ' + stage.artistJa);
        watchContrast();
      }
      if (changed || opts.play === true || deckMismatch) routeAudio(id, opts.play === true);
      return true;
    }

    function setSai(on, options) {
      const opts = options || {};
      if (state.sai !== on) {
        state.sai = on;
        if (on) state.tt.stage = 'all';
        renderStage(true);
        invoke(stageCanvas, 'setStageModeSai', on);
        sfx('stage_switch', on ? 0.84 : 1);
        announce(on ? 'All stages overview. Timetable shows every stage.' : 'Back to stage ' + activeStage().num);
        renderTimetable();
        watchContrast();
      }
      if (on && opts.reveal) revealTimetable();
      return true;
    }

    function stepStage(delta) {
      const index = stages.indexOf(activeStage());
      setStage(stages[(index + delta + stages.length) % stages.length].id);
    }

    function revealTimetable() {
      el.ttTitle.focus({ preventScroll: true });
      el.timetable.scrollIntoView({ behavior: state.motion ? 'smooth' : 'auto', block: 'start' });
      el.ttList.dataset.spotlit = 'true';
      global.clearTimeout(spotlitTimer);
      spotlitTimer = global.setTimeout(() => { el.ttList.dataset.spotlit = 'false'; }, beatMs() * 4);
    }

    // Night that playback brought on ends with playback. Night chosen on the toggle stays.
    function setHall(mode, source) {
      if (mode === state.hall) {
        if (source === 'manual') state.hallSource = source;
        return;
      }
      state.hall = mode;
      state.hallSource = source;
      root.dataset.hall = mode;
      invoke(stageCanvas, 'setHallMode', mode);
      el.themeColor.content = mode === 'night' ? stageView().nightBg : DATA.festival.paper;
      renderToggles();
      announce(mode === 'night' ? 'Hall blackout' : 'Hall lights up');
      watchContrast();
    }

    function setMotion(on) {
      state.motion = Boolean(on);
      invoke(motionEngine, 'setMotionEnabled', state.motion);
      root.dataset.motion = state.motion ? 'on' : 'off';
      if (!state.motion) {
        invoke(stageCanvas, 'setPointer', 0, 0);
        tiltPass(0, 0);
      }
      renderToggles();
    }

    function setSfx(on) {
      state.sfx = Boolean(on);
      invoke(audioEngine, 'setSfx', state.sfx);
      renderToggles();
      sfx('transport');
    }

    function renderToggles() {
      setText(el.motionBtn, state.motion ? 'MOTION ON' : 'MOTION OFF');
      el.motionBtn.setAttribute('aria-pressed', String(state.motion));
      setText(el.hallBtn, state.hall === 'night' ? 'NIGHT 暗転' : 'LIGHT DAY');
      el.hallBtn.setAttribute('aria-pressed', String(state.hall === 'night'));
      [el.sfxBtn, el.bandSfxBtn].forEach(button => {
        setText(button, state.sfx ? 'SFX ON' : 'SFX OFF');
        button.setAttribute('aria-pressed', String(state.sfx));
      });
    }

    /* ---------- Transport ---------- */

    function readTransport() {
      const stage = activeStage();
      const t = invoke(audioEngine, 'getTransport') || {};
      const duration = Number.isFinite(t.durationSec) && t.durationSec > 0 ? t.durationSec : stage.durationSec;
      return {
        state: typeof t.state === 'string' ? t.state : (t.playing ? 'playing' : 'idle'),
        time: clamp(Number(t.currentTimeSec) || 0, 0, duration),
        duration: duration,
        deck: t.activeDeck || 'A',
        stageId: stageById.has(t.stageId) ? t.stageId : stage.id,
        unlocked: Boolean(t.unlocked)
      };
    }

    function poll() {
      global.clearTimeout(pollTimer);
      transport = readTransport();
      const active = transport.state === 'playing' || transport.state === 'loading';
      if (active !== transportActive) {
        transportActive = active;
        global.clearTimeout(lightsUpTimer);
        if (active) {
          setHall('night', 'transport');
        } else {
          lightsUpTimer = global.setTimeout(() => {
            if (!transportActive && state.hall === 'night' && state.hallSource === 'transport') setHall('day', 'transport');
          }, beatMs());
        }
      }
      renderTransport();
      pollTimer = global.setTimeout(poll, active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    }

    function paintRange(input, lo, hi) {
      input.style.setProperty('--lo', (clamp(lo, 0, 1) * 100).toFixed(2) + '%');
      input.style.setProperty('--hi', (clamp(hi, 0, 1) * 100).toFixed(2) + '%');
    }

    function renderTransport() {
      const t = transport;
      const playing = t.state === 'playing';
      const loading = t.state === 'loading';
      if (root.dataset.transport !== t.state) {
        root.dataset.transport = t.state;
        el.playBtn.setAttribute('aria-pressed', String(playing || loading));
        el.heroPlay.setAttribute('aria-busy', String(loading));
        setText(el.heroPlayLabel, playing ? 'PAUSE / ON AIR' : loading ? 'CUEING DECK' : 'LISTEN / PLAY NOW');
      }
      // A deck stopped at its cue point is standing by, and one stopped at the end has finished its set.
      const tally = playing ? 'ON AIR' : loading ? 'CUEING'
        : t.time <= 0.05 ? 'STANDBY' : t.time >= t.duration - 0.05 ? 'SET END' : 'PAUSED';
      setText(el.tally, tally);
      setText(el.liveState, tally);

      const track = stageById.get(t.stageId);
      const max = t.duration.toFixed(2);
      if (el.seek.max !== max || el.seek.dataset.track !== track.id) {
        el.seek.max = max;
        el.seek.dataset.track = track.id;
        // One slider step is one beat, so arrow keys and drags seek on the grid.
        el.seek.step = (60 / track.measuredBpm).toFixed(4);
        el.loopRegion.style.setProperty('--loop-l', (track.loopStartSec / t.duration).toFixed(4));
        el.loopRegion.style.setProperty('--loop-w', ((track.loopEndSec - track.loopStartSec) / t.duration).toFixed(4));
      }
      if (!scrubbing) el.seek.value = t.time.toFixed(2);
      const shown = scrubbing ? Number(el.seek.value) : t.time;
      paintRange(el.seek, 0, shown / t.duration);
      setText(el.elapsed, fmtClock(shown));
      setText(el.duration, fmtClock(t.duration));
      const valueText = Math.floor(shown) + ' seconds of ' + Math.round(t.duration) + ' seconds';
      if (el.seek.getAttribute('aria-valuetext') !== valueText) el.seek.setAttribute('aria-valuetext', valueText);

      const frame = t.state === 'playing' ? invoke(audioEngine, 'getFrame') : null;
      const beat = frame && Number.isFinite(frame.beatIndex) ? frame.beatIndex : -1;
      setText(el.liveBar, beat < 0 ? 'BAR 00 / BEAT 0' : 'BAR ' + pad2(Math.floor(beat / 4) + 1) + ' / BEAT ' + (beat % 4 + 1));
      setText(el.liveDeck, 'DECK ' + t.deck);
    }

    function onAudioError(error) {
      report('audio could not start', error);
      setText(el.heroStatus, 'AUDIO COULD NOT LOAD');
      poll();
    }

    function togglePlay() {
      if (!audioEngine) {
        setText(el.heroStatus, 'AUDIO ENGINE OFFLINE');
        return;
      }
      const current = readTransport().state;
      if (current === 'playing' || current === 'loading') {
        invoke(audioEngine, 'pause');
        sfx('transport');
        poll();
      } else {
        routeAudio(state.stageId, true);
      }
    }

    function renderFaders() {
      const f = state.filter;
      const flat = Math.abs(f) < 0.02;
      const hz = f < 0 ? 18000 * Math.pow(100, f) : 30 * Math.pow(100, f);
      el.filter.value = String(f);
      paintRange(el.filter, Math.min(0.5, (f + 1) / 2), Math.max(0.5, (f + 1) / 2));
      setText(el.filterValue, flat ? 'FLAT' : (f < 0 ? 'LP ' : 'HP ') + fmtHz(hz));
      el.filter.setAttribute('aria-valuetext', flat ? 'FLAT' : (f < 0 ? 'LOW PASS ' : 'HIGH PASS ') + fmtHz(hz) + ' Hz');

      const send = Math.round((state.delay / DELAY_MAX) * 100) + '%';
      el.delay.value = String(state.delay);
      paintRange(el.delay, 0, state.delay / DELAY_MAX);
      setText(el.delayValue, send);
      el.delay.setAttribute('aria-valuetext', 'SEND ' + send);

      const gain = Math.round(state.master * 100) + '%';
      el.master.value = String(state.master);
      paintRange(el.master, 0, state.master);
      setText(el.masterValue, gain);
      el.master.setAttribute('aria-valuetext', gain);
    }

    /* ---------- Console ---------- */

    function renderConsole(stage) {
      const bars = Math.round(((stage.loopEndSec - stage.loopStartSec) * stage.measuredBpm) / 240);
      setText(el.consoleChip, 'STAGE ' + stage.num);
      setText(el.consoleStageName, stage.kanji + ' ' + stage.code + ' / ' + stage.stageName);
      setText(consoleCell['bpm-measured'], fmtBpm(stage.measuredBpm));
      setText(consoleCell['bpm-prompt'], fmtBpm(stage.promptBpm));
      setText(consoleCell.key, stage.measuredKey);
      setText(consoleCell.lufs, stage.master.integrated_lufs.toFixed(2));
      setText(consoleCell.dbtp, stage.master.true_peak_dbtp.toFixed(2));
      setText(consoleCell.seed, String(stage.seed));
      setText(consoleCell.length, fmtClock(stage.durationSec));
      setText(consoleCell['loop-label'], bars + ' BAR LOOP');
      setText(consoleCell.loop, fmtClock(stage.loopStartSec) + ' - ' + fmtClock(stage.loopEndSec));
      setText(consoleCell['delay-time'], Math.round((0.75 * 60000) / stage.measuredBpm) + ' ms');
      setText(el.vocalBadge, stage.vocal ? '[VOCAL TAKE]' : '[INSTRUMENTAL SCORE]');
      setText(el.genre, stage.genre);
      setText(el.stylePrompt, stage.stylePrompt);
      if (el.lyrics.dataset.stage === stage.id) return;
      el.lyrics.dataset.stage = stage.id;
      el.lyrics.dataset.kind = stage.vocal ? 'lyrics' : 'instrumental';
      el.lyrics.textContent = '';
      (stage.vocal ? stage.lyrics : stage.instrumentalNote).split(/\n{2,}/).forEach(block => {
        const lines = block.split('\n');
        const tag = lines.length > 1 && /^\[.+\]$/.test(lines[0]) ? lines.shift() : '';
        el.lyrics.appendChild(h('div', { class: 'stanza' }, [
          tag && h('p', { class: 'stanza-tag', text: tag }),
          h('p', { class: 'stanza-lines', text: lines.join('\n') })
        ]));
      });
    }

    /* ---------- Dossier ---------- */

    function renderDossier() {
      el.dossierGrid.textContent = '';
      stages.forEach(stage => {
        el.dossierGrid.appendChild(h('article', { class: 'plate', style: inkStyle(stage), 'data-stage-id': stage.id, 'data-active': 'false' }, [
          h('header', { class: 'plate-head' }, [
            h('span', { class: 'plate-glyph', lang: 'ja', 'aria-hidden': 'true', text: stage.kanji }),
            h('p', { class: 'plate-id' }, [
              h('span', { class: 'plate-code', text: stage.num + ' ' + stage.code }),
              h('span', { text: stage.stageName.toUpperCase() }),
              h('span', { text: stage.setTime })
            ])
          ]),
          h('figure', { class: 'plate-figure halftone', 'data-screen': stage.screenKind, style: '--screen-angle:' + stage.screenAngle + 'deg' }, [
            h('img', { src: ns.resolveAsset(stage.webpPath), width: 1000, height: 1250, loading: 'lazy', decoding: 'async', alt: stage.artistJa + ' ' + stage.artistEn }),
            h('span', { class: 'plate-on-poster', text: 'ON POSTER' })
          ]),
          h('div', { class: 'plate-body' }, [
            h('h3', { class: 'plate-artist' }, [
              h('span', { class: 'plate-artist-ja', lang: 'ja', text: stage.artistJa }),
              h('span', { class: 'plate-artist-en', text: stage.artistEn })
            ]),
            h('p', { class: 'plate-role', text: stage.role }),
            h('p', { class: 'plate-gear-title', text: stage.gearTitle }),
            h('p', { class: 'plate-gear-desc', lang: 'en', text: stage.gearDesc }),
            h('blockquote', { class: 'plate-quote', lang: 'ja', text: stage.quote }),
            h('div', { class: 'plate-foot' }, [
              h('p', { class: 'plate-stamps' }, [
                h('span', { class: 'stamp', text: 'BPM ' + fmtBpm(stage.measuredBpm) }),
                h('span', { class: 'stamp', text: 'KEY ' + stage.measuredKey })
              ]),
              h('button', { class: 'key key--on-plate', type: 'button', 'data-cue-stage': stage.id, 'data-sfx-hover': '1' }, [
                h('span', { text: 'CUE STAGE' }),
                h('span', { class: 'sr-only', text: stage.num + ' ' + stage.stageName })
              ])
            ])
          ])
        ]));
      });
    }

    /* ---------- Timetable ---------- */

    function renderToolbar() {
      el.ttDays.textContent = '';
      dayKeys.forEach((day, index) => {
        const label = 'DAY ' + (index + 1) + ' · ' + DATA.timetable[day][0].dateLabel.replace(/^\d{4}\./, '');
        el.ttDays.appendChild(h('button', { class: 'pill', type: 'button', 'data-day': day, 'aria-pressed': 'false', text: label }));
      });
      el.ttStages.textContent = '';
      el.ttStages.appendChild(h('button', { class: 'pill', type: 'button', 'data-stage-filter': 'all', 'aria-pressed': 'true', text: 'ALL' }));
      stages.forEach(stage => {
        el.ttStages.appendChild(h('button', { class: 'pill pill--ink', type: 'button', style: inkStyle(stage), 'data-stage-filter': stage.id, 'aria-pressed': 'false' }, [
          h('span', { class: 'pill-dot', 'aria-hidden': 'true' }),
          h('span', { text: stage.num + ' ' + stage.kanji }),
          h('span', { class: 'sr-only', text: stage.stageName })
        ]));
      });
    }

    function renderAct(act) {
      const stage = stageById.get(act.stageId);
      const saved = state.bookmarks.has(act.id);
      return h('li', { class: 'tt-row', style: inkStyle(stage), 'data-act-id': act.id, 'data-stage-id': act.stageId, 'data-headliner': String(act.isHeadliner) }, [
        h('p', { class: 'tt-time' }, [
          h('span', { class: 'tt-start', text: act.timeStart }),
          h('span', { class: 'tt-end', text: act.timeEnd + ' JST' })
        ]),
        h('p', { class: 'tt-stage' }, [
          h('span', { class: 'chip chip--ink', text: act.stageNum + ' ' + act.stageKanji }),
          h('span', { text: act.stageName })
        ]),
        h('div', { class: 'tt-act' }, [
          h('p', { class: 'tt-artist' }, [
            h('span', { class: 'tt-artist-ja', lang: 'ja', text: act.artistJa }),
            h('span', { class: 'tt-artist-en', text: act.artistEn })
          ]),
          h('p', { class: 'tt-format' }, [
            h('span', { text: act.format }),
            act.isHeadliner && h('span', { class: 'tt-headliner', text: 'HEADLINER' })
          ]),
          h('p', { class: 'tt-summary', lang: 'en', text: act.summary })
        ]),
        h('p', { class: 'tt-meta' }, [
          h('span', { text: 'BPM ' + fmtBpm(act.bpm) }),
          h('span', { text: 'KEY ' + act.key })
        ]),
        h('div', { class: 'tt-actions' }, [
          h('button', { class: 'tt-btn tt-bookmark', type: 'button', 'data-bookmark': act.id, 'aria-pressed': String(saved) }, [
            h('span', { text: 'MY SCHEDULE' }),
            h('span', { class: 'sr-only', text: act.artistJa + ' ' + act.timeStart })
          ]),
          h('button', { class: 'tt-btn tt-cue', type: 'button', 'data-cue-stage': act.previewStageId }, [
            h('span', { text: 'CUE' }),
            h('span', { class: 'sr-only', text: act.stageName + ' preview' })
          ])
        ])
      ]);
    }

    function renderTimetable() {
      const tt = state.tt;
      const rows = DATA.timetable[tt.day].filter(act =>
        (tt.stage === 'all' || act.stageId === tt.stage) && (!tt.mineOnly || state.bookmarks.has(act.id)));
      el.ttDays.querySelectorAll('[data-day]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.day === tt.day));
      });
      el.ttStages.querySelectorAll('[data-stage-filter]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.stageFilter === tt.stage));
      });
      el.ttMine.setAttribute('aria-pressed', String(tt.mineOnly));

      el.ttList.textContent = '';
      rows.forEach(act => el.ttList.appendChild(renderAct(act)));
      if (!rows.length) {
        el.ttList.appendChild(h('li', { class: 'tt-empty', text: tt.mineOnly
          ? 'NO SAVED ACTS HERE YET. PRESS MY SCHEDULE ON ANY ACT.'
          : 'NO ACTS ON THIS STAGE FOR THIS DAY.' }));
      }
      const dayLabel = 'DAY ' + (dayKeys.indexOf(tt.day) + 1);
      const scope = tt.stage === 'all' ? 'ALL STAGES' : 'STAGE ' + stageById.get(tt.stage).num;
      const note = state.schedulePersisted ? '' : ' / STORAGE BLOCKED, SAVED FOR THIS VISIT ONLY';
      setText(el.ttStatus, rows.length + (rows.length === 1 ? ' ACT' : ' ACTS') + ' / ' + dayLabel + ' / ' + scope + (tt.mineOnly ? ' / MY SCHEDULE' : '') + note);
    }

    function renderScheduleCount(bump) {
      setText(el.ttCount, String(state.bookmarks.size));
      if (!bump || !state.motion) return;
      el.ttCount.classList.remove('is-bumped');
      void el.ttCount.offsetWidth;
      el.ttCount.classList.add('is-bumped');
    }

    function toggleBookmark(id) {
      const saved = !state.bookmarks.has(id);
      if (saved) state.bookmarks.add(id);
      else state.bookmarks.delete(id);
      state.schedulePersisted = saveSchedule(state.bookmarks);
      sfx('bookmark', saved ? 1 : 0.82);
      renderScheduleCount(saved);
      renderTimetable();
      const again = el.ttList.querySelector('[data-bookmark="' + id + '"]');
      (again || el.ttMine).focus({ preventScroll: true });
    }

    /* ---------- Press pass ---------- */

    const passHandle = () => state.pass.handle.replace(/^-+|-+$/g, '') || DEFAULT_HANDLE;
    const passFileName = () => 'ai-ultra-musicfes-pass-' + passHandle() + '.png';

    function syncPass() {
      setText(el.passFile, passFileName());
      invoke(stageCanvas, 'setPassSeed', {
        handle: passHandle(),
        stageId: state.pass.stageId,
        tiltX: state.pass.tiltX,
        tiltY: state.pass.tiltY
      });
    }

    function tiltPass(x, y) {
      state.pass.tiltX = x;
      state.pass.tiltY = y;
      el.passTilt.style.setProperty('--tilt-x', x.toFixed(3));
      el.passTilt.style.setProperty('--tilt-y', y.toFixed(3));
      syncPass();
    }

    function renderStampOptions() {
      el.passStamps.textContent = '';
      stages.forEach(stage => {
        el.passStamps.appendChild(h('label', { class: 'stamp-option', style: inkStyle(stage) }, [
          h('input', { type: 'radio', name: 'pass-stage', value: stage.id }),
          h('span', { class: 'stamp-face' }, [
            h('span', { text: stage.num + ' ' + stage.kanji }),
            h('span', { class: 'sr-only', text: stage.stageName })
          ])
        ]));
      });
    }

    function renderStamps() {
      el.passStamps.querySelectorAll('input').forEach(input => {
        input.checked = input.value === state.pass.stageId;
      });
    }

    function onHandleInput(event) {
      if (event.isComposing) return;
      const raw = el.passInput.value;
      const clean = sanitizeHandle(raw);
      if (clean !== raw) {
        const caret = Math.min(el.passInput.selectionStart || clean.length, clean.length);
        el.passInput.value = clean;
        el.passInput.setSelectionRange(caret, caret);
      }
      state.pass.handle = clean;
      setText(el.passStatus, '');
      syncPass();
      global.clearTimeout(sfxTypingTimer);
      sfxTypingTimer = global.setTimeout(() => sfx('console', 0.92 + (clean.length % 5) * 0.04), 140);
    }

    function exportPass() {
      if (!stageCanvas) {
        setText(el.passStatus, 'PASS RENDERER OFFLINE');
        return;
      }
      const name = passFileName();
      sfx('mint');
      tiltPass(0, 0);
      // The pass surface sleeps while off screen, so print the flat, untilted pass now before reading it.
      invoke(motionEngine, 'triggerStaticRender', 'pass');
      try {
        el.passCanvas.toBlob(blob => {
          if (!blob) {
            setText(el.passStatus, 'EXPORT FAILED');
            return;
          }
          const url = global.URL.createObjectURL(blob);
          const link = h('a', { href: url, download: name });
          doc.body.appendChild(link);
          link.click();
          link.remove();
          global.setTimeout(() => global.URL.revokeObjectURL(url), 4000);
          setText(el.passStatus, 'MINTED ' + name);
        }, 'image/png');
      } catch (error) {
        // A canvas that drew file:// images is tainted. The built site and the offline file are not.
        report('pass export was blocked', error);
        setText(el.passStatus, 'EXPORT BLOCKED BY THE BROWSER. OPEN THE BUILT SITE TO MINT.');
      }
    }

    /* ---------- Colophon ---------- */

    function renderColophon() {
      const c = DATA.colophon;
      const row = (title, cells) => h('div', { class: 'colophon-row' }, [h('strong', { text: title })].concat(cells.map(text => h('span', { text: text }))));
      const license = (title, text) => h('details', { class: 'license' }, [
        h('summary', { text: title }),
        h('pre', { tabindex: '0', role: 'region', 'aria-label': title, 'data-verbatim': 'license', text: text })
      ]);
      const proofFor = family => state.fonts.probes.find(probe => probe.family === family);

      el.colophonBody.textContent = '';
      el.colophonBody.append(
        h('h3', { text: 'DIRECTION' }),
        h('p', { lang: 'en', text: c.directionSummary }),
        h('h3', { text: 'INSPECTED REFERENCES' }),
        h('ul', { class: 'colophon-list' }, c.references.map(ref => h('li', null, [
          h('strong', { text: ref.title }),
          h('span', { lang: 'en', text: ref.takeaway })
        ]))),
        h('h3', { text: 'TYPE / SIL OFL 1.1' }),
        h('div', { class: 'colophon-table' }, c.typography.map(font => {
          const proof = proofFor(font.family);
          const axes = font.axes.length ? font.axes.map(axis => axis.tag + ' ' + axis.min + ' to ' + axis.max).join(' / ') : 'STATIC';
          return row(font.family, [
            font.role.toUpperCase(),
            fmtKb(font.bytes),
            font.glyphCount + ' GLYPHS',
            axes,
            proof ? 'RENDER DIFF ' + proof.diffPx + ' px VS ' + proof.fallback.toUpperCase() : 'RENDER DIFF PENDING'
          ]);
        })),
        h('h3', { text: 'AUDIO PRODUCTION' }),
        h('p', { text: c.audioProduction.engine }),
        h('div', { class: 'colophon-table' }, c.audioProduction.tracksSummary.map(track => {
          const stage = stageById.get(track.id);
          return row(stage.num + ' ' + stage.kanji + ' ' + stage.code + ' / ' + stage.stageName, [
            'MEASURED ' + fmtBpm(track.measuredBpm) + ' BPM',
            'PROMPT ' + fmtBpm(track.promptBpm) + ' BPM',
            track.measuredKey,
            track.lufs.toFixed(2) + ' LUFS',
            track.dbtp.toFixed(2) + ' dBTP',
            fmtKb(track.bytes)
          ]);
        }).concat(row('TOTAL AUDIO', [fmtKb(c.audioProduction.totalAudioBytes)]))),
        h('h3', { text: 'LICENSES' }),
        license('MIT LICENSE / MOTION ATLAS', c.licenses.motionAtlasMit),
        license('SIL OFL 1.1 / DELA GOTHIC ONE', c.licenses.oflDelaGothicOne),
        license('SIL OFL 1.1 / ARCHIVO', c.licenses.oflArchivo),
        license('SIL OFL 1.1 / M PLUS 1 CODE', c.licenses.oflMPlus1Code)
      );
    }

    function openColophon() {
      if (el.dialog.open) return;
      if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
      else el.dialog.setAttribute('open', '');
      sfx('console');
    }

    function closeColophon() {
      if (typeof el.dialog.close === 'function') el.dialog.close();
      else el.dialog.removeAttribute('open');
    }

    /* ---------- Printer's proof: contrast, fonts, overflow ---------- */

    function renderContrast() {
      const style = global.getComputedStyle(root);
      const read = token => parseColor(style.getPropertyValue(token));
      const colors = { '--bg': read('--bg'), '--fg': read('--fg'), '--accent': read('--accent'), '--accent-fg': read('--accent-fg') };
      if (Object.keys(colors).some(token => !colors[token])) return '';
      const pairs = {
        'bg-fg': contrastRatio(colors['--bg'], colors['--fg']),
        'ink-text': contrastRatio(colors['--accent'], colors['--accent-fg'])
      };
      el.contrastBar.querySelectorAll('.cb-swatch').forEach(swatch => {
        setText(swatch.querySelector('.cb-hex'), toHex(colors[swatch.dataset.token]));
      });
      el.contrastBar.querySelectorAll('.cb-ratio').forEach(node => {
        const ratio = pairs[node.dataset.pair];
        node.dataset.grade = wcagGrade(ratio);
        setText(node.querySelector('.cb-value'), ratio.toFixed(2) + ':1');
        setText(node.querySelector('.cb-grade'), wcagGrade(ratio));
      });
      state.contrast = {
        bg: toHex(colors['--bg']),
        fg: toHex(colors['--fg']),
        accent: toHex(colors['--accent']),
        accentFg: toHex(colors['--accent-fg']),
        bgFg: Number(pairs['bg-fg'].toFixed(2)),
        inkText: Number(pairs['ink-text'].toFixed(2))
      };
      return JSON.stringify(state.contrast);
    }

    // Sample through the ink transition, then stop once two readings agree, so the bar ends on settled colors.
    function watchContrast() {
      global.clearInterval(contrastTimer);
      let last = renderContrast();
      let ticks = 0;
      contrastTimer = global.setInterval(() => {
        const now = renderContrast();
        ticks += 1;
        if ((now === last && ticks > 2) || ticks > 40) global.clearInterval(contrastTimer);
        last = now;
      }, 80);
    }

    function renderFontStamp() {
      const fonts = state.fonts;
      const overflow = fonts.overflowPx + 'px OVERFLOW';
      let text = 'FONTS CHECKING';
      if (fonts.status === 'unverified') text = 'FONTS UNVERIFIED · ' + overflow;
      else if (fonts.status !== 'checking') text = 'FONTS ' + fonts.status.toUpperCase() + ' · ' + fonts.loaded + '/' + fonts.total + ' LOADED · ' + overflow;
      setText(el.fontStamp, text);
      el.fontStamp.dataset.status = fonts.status;
      el.fontStamp.dataset.overflow = String(fonts.overflowPx);
      el.fontStamp.title = fonts.probes.map(probe => probe.family + ' ' + probe.diffPx + ' px vs ' + probe.fallback).join(' / ');
    }

    function measureOverflow() {
      state.fonts.overflowPx = Math.max(0, Math.max(root.scrollWidth, doc.body.scrollWidth) - root.clientWidth);
      renderFontStamp();
    }

    function runFontProof() {
      const fontSet = doc.fonts;
      if (!fontSet || typeof fontSet.load !== 'function') {
        state.fonts.status = 'unverified';
        measureOverflow();
        return;
      }
      const spec = probe => probe.weight + ' 48px "' + probe.family + '"';
      // A failed font request counts as not loaded. The pixel diff below is the verdict.
      Promise.all(FONT_PROBES.map(probe => fontSet.load(spec(probe), probe.sample).catch(() => [])))
        .then(() => fontSet.ready)
        .then(() => {
          state.fonts.probes = FONT_PROBES.map(probe => {
            const diffPx = inkDiff(probe);
            return { id: probe.id, family: probe.family, fallback: probe.fallback, diffPx: diffPx, loaded: diffPx > 0 && fontSet.check(spec(probe), probe.sample) };
          });
          state.fonts.loaded = state.fonts.probes.filter(probe => probe.loaded).length;
          state.fonts.status = state.fonts.loaded === state.fonts.total ? 'verified' : state.fonts.loaded ? 'partial' : 'missing';
          measureOverflow();
          renderColophon();
        });
    }

    /* ---------- Follow-spot focus ---------- */

    function placeSpot() {
      const rect = spotTarget.getBoundingClientRect();
      root.style.setProperty('--focus-x', Math.round(rect.left + rect.width / 2 + global.scrollX) + 'px');
      root.style.setProperty('--focus-y', Math.round(rect.top + rect.height / 2 + global.scrollY) + 'px');
    }

    function onFocusIn(event) {
      const target = event.target;
      let keyboard = false;
      try {
        keyboard = target instanceof global.Element && target.matches(':focus-visible') && !el.dialog.contains(target);
      } catch (_error) {
        keyboard = false;
      }
      spotTarget = keyboard ? target : null;
      if (keyboard) placeSpot();
      root.dataset.focusSpot = keyboard ? 'on' : 'off';
    }

    /* ---------- Events ---------- */

    function pressRail(id, viaArrow) {
      if (id !== allStage.id) setStage(id);
      else if (viaArrow) setSai(true);
      else setSai(!state.sai, { reveal: true });
    }

    function cueFrom(event) {
      const button = event.target.closest('[data-cue-stage]');
      if (button) setStage(button.dataset.cueStage, { play: true });
      return Boolean(button);
    }

    railButtons.forEach((button, id) => {
      button.style.cssText = inkStyle(id === allStage.id ? allStage : stageById.get(id));
      button.addEventListener('click', () => pressRail(id, false));
    });

    // Digits and rail arrows only act while focus is inside the kanji rail (WCAG 2.1.4).
    el.poster.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const inRail = el.rail.contains(event.target);
      if (!inRail) return;
      const arrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
      let id = /^[1-5]$/.test(event.key) ? railOrder[Number(event.key) - 1] : null;
      if (arrow) {
        const index = railOrder.indexOf(stageView().id) + (event.key === 'ArrowDown' ? 1 : -1);
        id = railOrder[(index + railOrder.length) % railOrder.length];
      }
      if (!id) return;
      event.preventDefault();
      railButtons.get(id).focus();
      pressRail(id, arrow);
    });

    el.heroPlay.addEventListener('click', togglePlay);
    el.playBtn.addEventListener('click', togglePlay);
    byId('hero-prev-btn').addEventListener('click', () => stepStage(-1));
    byId('hero-next-btn').addEventListener('click', () => stepStage(1));
    byId('transport-prev-btn').addEventListener('click', () => stepStage(-1));
    byId('transport-next-btn').addEventListener('click', () => stepStage(1));

    el.seek.addEventListener('input', () => {
      scrubbing = true;
      renderTransport();
    });
    el.seek.addEventListener('change', () => {
      scrubbing = false;
      invoke(audioEngine, 'seek', Number(el.seek.value));
      poll();
    });

    el.loopBtn.addEventListener('click', () => {
      state.loop = !state.loop;
      invoke(audioEngine, 'setLoop', state.loop);
      el.loopBtn.setAttribute('aria-pressed', String(state.loop));
      el.band.dataset.loop = state.loop ? 'on' : 'off';
      sfx('transport');
      poll();
    });
    const setFader = (key, method, value) => {
      state[key] = value;
      invoke(audioEngine, method, value);
      renderFaders();
    };
    el.filter.addEventListener('input', () => setFader('filter', 'setFilter', clamp(Number(el.filter.value), -1, 1)));
    el.filter.addEventListener('dblclick', () => setFader('filter', 'setFilter', 0));
    el.delay.addEventListener('input', () => setFader('delay', 'setDelay', clamp(Number(el.delay.value), 0, DELAY_MAX)));
    el.master.addEventListener('input', () => setFader('master', 'setMaster', clamp(Number(el.master.value), 0, 1)));
    el.djBtn.addEventListener('click', () => {
      const open = el.band.dataset.dj !== 'open';
      el.band.dataset.dj = open ? 'open' : 'closed';
      el.djBtn.setAttribute('aria-expanded', String(open));
      sfx('transport');
    });
    byId('transport-console-link').addEventListener('click', () => {
      el.band.dataset.dj = 'closed';
      el.djBtn.setAttribute('aria-expanded', 'false');
      sfx('console');
    });

    el.motionBtn.addEventListener('click', () => {
      setMotion(!state.motion);
      sfx('transport');
    });
    el.hallBtn.addEventListener('click', () => {
      setHall(state.hall === 'night' ? 'day' : 'night', 'manual');
      sfx('stage_switch', 0.7);
    });
    el.sfxBtn.addEventListener('click', () => setSfx(!state.sfx));
    el.bandSfxBtn.addEventListener('click', () => setSfx(!state.sfx));

    el.dossierGrid.addEventListener('click', cueFrom);
    el.ttList.addEventListener('click', event => {
      if (cueFrom(event)) return;
      const bookmark = event.target.closest('[data-bookmark]');
      if (bookmark) toggleBookmark(bookmark.dataset.bookmark);
    });
    el.ttDays.addEventListener('click', event => {
      const button = event.target.closest('[data-day]');
      if (!button) return;
      state.tt.day = button.dataset.day;
      sfx('transport');
      renderTimetable();
    });
    el.ttStages.addEventListener('click', event => {
      const button = event.target.closest('[data-stage-filter]');
      if (!button) return;
      state.tt.stage = button.dataset.stageFilter;
      sfx('transport');
      renderTimetable();
    });
    el.ttMine.addEventListener('click', () => {
      state.tt.mineOnly = !state.tt.mineOnly;
      sfx('transport');
      renderTimetable();
    });
    el.ttCount.addEventListener('animationend', () => el.ttCount.classList.remove('is-bumped'));

    el.passInput.addEventListener('focus', () => el.passInput.scrollIntoView({ block: 'nearest' }));
    el.passInput.addEventListener('input', onHandleInput);
    el.passInput.addEventListener('compositionend', onHandleInput);
    el.passInput.addEventListener('change', () => {
      state.pass.handle = passHandle();
      el.passInput.value = state.pass.handle;
      syncPass();
    });
    byId('pass-form').addEventListener('submit', event => event.preventDefault());
    el.passStamps.addEventListener('change', event => {
      state.pass.stageId = event.target.value;
      state.pass.pinned = true;
      sfx('bookmark');
      syncPass();
    });
    el.passBtn.addEventListener('click', exportPass);
    // Pointer position inside a box, as -1..1 on both axes.
    const pointerIn = (event, node) => {
      const rect = node.getBoundingClientRect();
      return [
        clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
        clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1)
      ];
    };
    el.passTilt.addEventListener('pointermove', event => {
      if (state.motion) tiltPass.apply(null, pointerIn(event, el.passTilt));
    });
    el.passTilt.addEventListener('pointerleave', () => tiltPass(0, 0));

    el.posterField.addEventListener('pointermove', event => {
      if (!state.motion || event.pointerType === 'touch') return;
      const at = pointerIn(event, el.lock);
      invoke(stageCanvas, 'setPointer', at[0], at[1]);
    });
    el.posterField.addEventListener('pointerleave', () => invoke(stageCanvas, 'setPointer', 0, 0));

    byId('colophon-open-btn').addEventListener('click', openColophon);
    byId('colophon-open-btn-footer').addEventListener('click', openColophon);
    byId('colophon-close-btn').addEventListener('click', closeColophon);
    el.dialog.addEventListener('click', event => {
      if (event.target === el.dialog) closeColophon();
    });

    doc.addEventListener('pointerover', event => {
      if (event.pointerType !== 'mouse') return;
      const target = event.target.closest('[data-sfx-hover]');
      if (target && !target.contains(event.relatedTarget)) sfx('hover', Number(target.dataset.sfxHover) || 1);
    });

    // UI cues need a running AudioContext before the first Play, so the first real gesture warms it up.
    const warmUp = event => {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (!audioEngine || transport.unlocked) {
        ['pointerdown', 'pointerup', 'keydown'].forEach(type => doc.removeEventListener(type, warmUp, true));
        return;
      }
      Promise.resolve(invoke(audioEngine, 'unlock')).then(poll, () => {});
    };
    ['pointerdown', 'pointerup', 'keydown'].forEach(type => doc.addEventListener(type, warmUp, true));

    doc.addEventListener('focusin', onFocusIn);
    doc.addEventListener('focusout', event => {
      if (!event.relatedTarget) {
        spotTarget = null;
        root.dataset.focusSpot = 'off';
      }
    });
    global.addEventListener('scroll', () => {
      if (!spotTarget || !el.band.contains(spotTarget) || scrollQueued) return;
      scrollQueued = true;
      global.requestAnimationFrame(() => {
        scrollQueued = false;
        if (spotTarget) placeSpot();
      });
    }, { passive: true });

    let resizeTimer = 0;
    global.addEventListener('resize', () => {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(() => {
        measureOverflow();
        if (spotTarget) placeSpot();
      }, 150);
    });

    /* ---------- First render ---------- */

    const reducedMotion = typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const engineMotion = invoke(motionEngine, 'isMotionEnabled');
    state.motion = typeof engineMotion === 'boolean' ? engineMotion : !reducedMotion;
    root.dataset.motion = state.motion ? 'on' : 'off';
    invoke(motionEngine, 'onMotionChange', enabled => {
      state.motion = Boolean(enabled);
      renderToggles();
    });

    renderDossier();
    renderToolbar();
    renderStampOptions();
    renderColophon();
    renderStage(false);
    renderToggles();
    renderFaders();
    renderTimetable();
    renderScheduleCount(false);
    invoke(stageCanvas, 'setHallMode', state.hall);
    invoke(stageCanvas, 'setStage', state.stageId, { animate: false });
    syncPass();
    watchContrast();
    runFontProof();
    poll();

    ns.app = Object.freeze({
      getState: () => ({
        stageId: state.stageId,
        sai: state.sai,
        dataStage: root.dataset.stage,
        hall: state.hall,
        hallSource: state.hallSource,
        motion: state.motion,
        sfx: state.sfx,
        loop: state.loop,
        filter: state.filter,
        delay: state.delay,
        master: state.master,
        transport: Object.assign({}, transport),
        timetable: Object.assign({ visible: el.ttList.querySelectorAll('.tt-row').length }, state.tt),
        bookmarks: Array.from(state.bookmarks),
        pass: { handle: passHandle(), stageId: state.pass.stageId, fileName: passFileName() },
        fonts: JSON.parse(JSON.stringify(state.fonts)),
        contrast: state.contrast && Object.assign({}, state.contrast),
        engines: { audio: Boolean(audioEngine), motion: Boolean(motionEngine), canvas: Boolean(stageCanvas) },
        artReady: preloaded.filter(image => image.complete && image.naturalWidth > 0).length
      }),
      setStage: setStage,
      setSai: setSai,
      setHall: mode => setHall(mode === 'night' ? 'night' : 'day', 'manual'),
      setMotion: setMotion,
      togglePlay: togglePlay,
      audioEngine: audioEngine,
      motionEngine: motionEngine,
      stageCanvas: stageCanvas
    });
    root.dataset.app = 'ready';
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
