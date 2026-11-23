/* Multi-surface canvas stage engine for AI ULTRA MUSICFES 2026.
 * Classic non-module script registering window.AIUMF.StageCanvasSystem.
 */
(function (global) {
  'use strict';

  var ns = (global.AIUMF = global.AIUMF || {});

  var CHAR_NATURAL_W = 1000;
  var CHAR_NATURAL_H = 1250;
  var PASS_W = 900;
  var PASS_H = 540;
  var SAI_NIGHT_BG = '#121110';
  var DEFAULT_PAPER = '#F3EEE3';
  var DEFAULT_SUMI = '#15120F';

  var rgbaCache = Object.create(null);

  function parseHexRgb(hex) {
    var clean = String(hex || '#15120F').replace('#', '');
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    var n = parseInt(clean, 16);
    if (isNaN(n)) return [21, 18, 15];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function hexToRgba(hex, alpha) {
    var a = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;
    var key = hex + '@' + a;
    if (rgbaCache[key]) return rgbaCache[key];
    var rgb = parseHexRgb(hex);
    var out = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
    rgbaCache[key] = out;
    return out;
  }

  function createOffscreenCanvas(w, h) {
    if (typeof global.document === 'undefined' || typeof global.document.createElement !== 'function') {
      return null;
    }
    var c = global.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function parseObjectPositionToken(token, fallback) {
    if (!token) return fallback;
    if (token === 'left' || token === 'top') return 0;
    if (token === 'center') return 0.5;
    if (token === 'right' || token === 'bottom') return 1;
    if (token.indexOf('%') !== -1) {
      var pct = parseFloat(token);
      if (isFinite(pct)) return pct / 100;
    }
    return fallback;
  }

  function computeCharacterFitRect(maskCanvas, heroImgEl, cssW, cssH) {
    var natW = (heroImgEl && heroImgEl.naturalWidth > 0) ? heroImgEl.naturalWidth : CHAR_NATURAL_W;
    var natH = (heroImgEl && heroImgEl.naturalHeight > 0) ? heroImgEl.naturalHeight : CHAR_NATURAL_H;

    if (
      heroImgEl &&
      maskCanvas &&
      typeof heroImgEl.getBoundingClientRect === 'function' &&
      typeof maskCanvas.getBoundingClientRect === 'function'
    ) {
      var imgRect = heroImgEl.getBoundingClientRect();
      var cvsRect = maskCanvas.getBoundingClientRect();
      if (imgRect.width > 1 && imgRect.height > 1 && cvsRect.width > 1 && cvsRect.height > 1) {
        var fitMode = 'contain';
        var posX = 0.5;
        var posY = 0.5;
        if (typeof global.getComputedStyle === 'function') {
          try {
            var style = global.getComputedStyle(heroImgEl);
            if (style && style.objectFit) fitMode = style.objectFit;
            if (style && style.objectPosition) {
              var parts = style.objectPosition.trim().split(/\s+/);
              posX = parseObjectPositionToken(parts[0], 0.5);
              posY = parseObjectPositionToken(parts[1] || parts[0], 0.5);
            }
          } catch (_e) {}
        }

        var drawW;
        var drawH;
        if (fitMode === 'fill') {
          drawW = imgRect.width;
          drawH = imgRect.height;
        } else if (fitMode === 'cover') {
          var coverScale = Math.max(imgRect.width / natW, imgRect.height / natH);
          drawW = natW * coverScale;
          drawH = natH * coverScale;
        } else {
          var containScale = Math.min(imgRect.width / natW, imgRect.height / natH);
          drawW = natW * containScale;
          drawH = natH * containScale;
        }

        var localX = (imgRect.left - cvsRect.left) + (imgRect.width - drawW) * posX;
        var localY = (imgRect.top - cvsRect.top) + (imgRect.height - drawH) * posY;
        return { x: localX, y: localY, w: drawW, h: drawH };
      }
    }

    var scale = Math.min(cssW / natW, cssH / natH);
    var fw = natW * scale;
    var fh = natH * scale;
    return {
      x: (cssW - fw) * 0.5,
      y: (cssH - fh) * 0.5,
      w: fw,
      h: fh
    };
  }

  function syncCanvasSize(canvas, dpr, fixedW, fixedH) {
    if (!canvas) return null;
    if (fixedW && fixedH) {
      var resizedFixed = (canvas.width !== fixedW || canvas.height !== fixedH);
      if (resizedFixed) {
        canvas.width = fixedW;
        canvas.height = fixedH;
      }
      return { cssW: fixedW, cssH: fixedH, dpr: 1, resized: resizedFixed };
    }

    var cssW = canvas.clientWidth || canvas.offsetWidth ||
      (canvas.parentElement ? canvas.parentElement.clientWidth : 0) || 640;
    var cssH = canvas.clientHeight || canvas.offsetHeight ||
      (canvas.parentElement ? canvas.parentElement.clientHeight : 0) || 480;
    cssW = Math.max(1, Math.round(cssW));
    cssH = Math.max(1, Math.round(cssH));

    var safeDpr = Math.min(Math.max(1, dpr || 1), 2);
    var targetW = Math.max(1, Math.round(cssW * safeDpr));
    var targetH = Math.max(1, Math.round(cssH * safeDpr));
    var resized = (canvas.width !== targetW || canvas.height !== targetH);
    if (resized) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    return { cssW: cssW, cssH: cssH, dpr: safeDpr, resized: resized };
  }

  function findBeatTiming(beatTimesSec, timeSec, bpm, durationSec) {
    var safeBpm = bpm && bpm > 0 ? bpm : 128;
    var beatDur = 60 / safeBpm;
    if (!beatTimesSec || beatTimesSec.length < 2) {
      var totalBeats = Math.max(0, timeSec) / beatDur;
      var bi = Math.floor(totalBeats);
      var bp = totalBeats - bi;
      return {
        beatIndex: bi,
        beatPhase: bp,
        step16: ((bi % 4) * 4 + Math.floor(bp * 4)) & 15,
        beatPulse: Math.pow(1 - bp, 2.4)
      };
    }

    var dur = durationSec && durationSec > 0
      ? durationSec
      : (beatTimesSec[beatTimesSec.length - 1] + beatDur);
    var t = ((timeSec % dur) + dur) % dur;

    var lo = 0;
    var hi = beatTimesSec.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (beatTimesSec[mid] <= t) lo = mid;
      else hi = mid - 1;
    }

    var t0 = beatTimesSec[lo];
    var t1 = lo + 1 < beatTimesSec.length ? beatTimesSec[lo + 1] : (t0 + beatDur);
    var span = Math.max(0.05, t1 - t0);
    var phase = Math.max(0, Math.min(0.9999, (t - t0) / span));
    return {
      beatIndex: lo,
      beatPhase: phase,
      step16: ((lo % 4) * 4 + Math.floor(phase * 4)) & 15,
      beatPulse: Math.pow(1 - phase, 2.4)
    };
  }

  function sanitizeHandle(raw) {
    var cleaned = String(raw || '').trim().toUpperCase();
    if (!cleaned) return 'GUEST-01';
    return cleaned.slice(0, 22);
  }

  function drawCropMarks(ctx, x, y, w, h, len, gap, color, lineW) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW || 1;
    ctx.beginPath();

    // Top-left
    ctx.moveTo(x - gap - len, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x, y - gap - len);
    ctx.lineTo(x, y - gap);
    // Top-right
    ctx.moveTo(x + w + gap, y);
    ctx.lineTo(x + w + gap + len, y);
    ctx.moveTo(x + w, y - gap - len);
    ctx.lineTo(x + w, y - gap);
    // Bottom-left
    ctx.moveTo(x - gap - len, y + h);
    ctx.lineTo(x - gap, y + h);
    ctx.moveTo(x, y + h + gap);
    ctx.lineTo(x, y + h + gap + len);
    // Bottom-right
    ctx.moveTo(x + w + gap, y + h);
    ctx.lineTo(x + w + gap + len, y + h);
    ctx.moveTo(x + w, y + h + gap);
    ctx.lineTo(x + w, y + h + gap + len);

    ctx.stroke();
    ctx.restore();
  }

  function StageCanvasSystem(options) {
    var opts = options || {};
    this._atlas = ns.MotionAtlas;
    this._data = opts.data || ns.DATA || { festival: {}, stages: [] };
    this._motion = opts.motionEngine || (ns.MotionEngine && ns.MotionEngine.getShared ? ns.MotionEngine.getShared() : ns.MotionEngine);
    this._audio = opts.audioEngine || null;

    var els = opts.elements || {};
    this._els = {
      heroBackCanvas: els.heroBackCanvas || null,
      heroMaskCanvas: els.heroMaskCanvas || null,
      heroWipeCanvas: els.heroWipeCanvas || null,
      heroImgEl: els.heroImgEl || null,
      scopeCanvas: els.scopeCanvas || null,
      passCanvas: els.passCanvas || null
    };

    this._paper = (this._data.festival && this._data.festival.paper) || DEFAULT_PAPER;
    this._sumi = (this._data.festival && this._data.festival.sumi) || DEFAULT_SUMI;
    this._stages = Array.isArray(this._data.stages) ? this._data.stages : [];
    this._stageMap = Object.create(null);
    this._masksLoaded = Object.create(null);
    this._maskCache = Object.create(null);

    for (var i = 0; i < this._stages.length; i++) {
      var st = this._stages[i];
      this._stageMap[st.id] = st;
      this._masksLoaded[st.id] = false;
    }

    this._activeStageId = this._stages.length > 0 ? this._stages[0].id : 'relay';
    this._hallMode = 'day';
    this._saiMode = false;
    this._disposed = false;

    this._pointerTargetX = 0;
    this._pointerTargetY = 0;
    this._pointerSpringX = { x: 0, v: 0, prevTarget: 0 };
    this._pointerSpringY = { x: 0, v: 0, prevTarget: 0 };

    this._wipeToken = 0;
    this._wipeArmedCount = 0;
    this._wipe = null;

    this._passSeed = {
      handle: 'GUEST-01',
      stageId: this._activeStageId,
      tiltX: 0,
      tiltY: 0
    };
    this._passTiltSpringX = { x: 0, v: 0, prevTarget: 0 };
    this._passTiltSpringY = { x: 0, v: 0, prevTarget: 0 };
    this._passDirty = true;

    this._tileCache = new Map();
    this._tintedChannelCache = new Map();

    this._preloadAllMasks();
    this._registerSurfaces();

    var self = this;
    this._onResize = function () {
      self._passDirty = true;
      if (self._motion && !self._motion.isMotionEnabled()) {
        self._motion.triggerStaticRender();
      }
    };
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('resize', this._onResize, { passive: true });
    }
  }

  StageCanvasSystem.prototype._getStage = function (stageId) {
    if (stageId && this._stageMap[stageId]) return this._stageMap[stageId];
    return this._stageMap[this._activeStageId] || this._stages[0] || {
      id: 'relay',
      num: '01',
      kanji: '響',
      code: 'KYŌ',
      stageName: 'Relay Gate',
      setTime: '20:00 - 20:40 JST',
      artistJa: '火花ナナ',
      artistEn: 'Hibana Nana',
      measuredBpm: 128,
      measuredKey: 'F minor',
      durationSec: 37.5,
      beatTimesSec: [],
      dayInk: '#EE4B2B',
      dayPlateText: '#15120F',
      nightBg: '#1C0E0A',
      nightLight: '#FF6B4A',
      emissiveHex: '#CFFF46',
      screenAngle: 15,
      screenKind: 'dot',
      gearPaths: [],
      seed: 421901
    };
  };

  StageCanvasSystem.prototype._preloadAllMasks = function () {
    for (var i = 0; i < this._stages.length; i++) {
      this._preloadMask(this._stages[i]);
    }
  };

  StageCanvasSystem.prototype._preloadMask = function (stage) {
    if (!stage || !stage.maskPath) return;
    if (this._maskCache[stage.id]) return;

    var entry = {
      id: stage.id,
      loaded: false,
      error: false,
      tainted: false,
      img: null,
      channels: null
    };
    this._maskCache[stage.id] = entry;

    if (typeof global.Image !== 'function') return;

    var resolved = typeof ns.resolveAsset === 'function'
      ? ns.resolveAsset(stage.maskPath)
      : stage.maskPath;
    if (!resolved) return;

    var img = new global.Image();
    // Omit crossOrigin for data URIs and same-origin/file:// assets so canvas never taints or rejects.
    img.decoding = 'async';

    var self = this;
    img.onload = function () {
      if (self._disposed) return;
      entry.img = img;
      self._extractMaskChannels(entry);
      entry.loaded = true;
      self._masksLoaded[stage.id] = true;
      if (self._motion && !self._motion.isMotionEnabled() && stage.id === self._activeStageId) {
        self._motion.triggerStaticRender('hero-mask');
      }
    };
    img.onerror = function () {
      entry.error = true;
      self._masksLoaded[stage.id] = false;
    };
    img.src = resolved;
    if (img.complete && img.naturalWidth > 0 && !entry.loaded) {
      img.onload();
    }
  };

  StageCanvasSystem.prototype._extractMaskChannels = function (entry) {
    if (!entry || !entry.img) return;
    var workW = 500;
    var workH = 625;
    var qW = 250;
    var qH = 313;

    var srcCanvas = createOffscreenCanvas(workW, workH);
    if (!srcCanvas) return;
    var srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) return;

    srcCtx.clearRect(0, 0, workW, workH);
    srcCtx.drawImage(entry.img, 0, 0, workW, workH);

    var imgData;
    try {
      imgData = srcCtx.getImageData(0, 0, workW, workH);
    } catch (_securityErr) {
      // Raw file:// without inlined assets cannot read back pixels; fallback draws mask directly.
      entry.tainted = true;
      return;
    }

    var data = imgData.data;
    var rCanvas = createOffscreenCanvas(workW, workH);
    var gCanvas = createOffscreenCanvas(workW, workH);
    var bCanvas = createOffscreenCanvas(workW, workH);
    if (!rCanvas || !gCanvas || !bCanvas) return;

    var rCtx = rCanvas.getContext('2d');
    var gCtx = gCanvas.getContext('2d');
    var bCtx = bCanvas.getContext('2d');

    var rData = rCtx.createImageData(workW, workH);
    var gData = gCtx.createImageData(workW, workH);
    var bData = bCtx.createImageData(workW, workH);
    var rd = rData.data;
    var gd = gData.data;
    var bd = bData.data;

    for (var i = 0; i < data.length; i += 4) {
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      if (r > 3) {
        rd[i] = 255; rd[i + 1] = 255; rd[i + 2] = 255; rd[i + 3] = r;
      }
      if (g > 3) {
        gd[i] = 255; gd[i + 1] = 255; gd[i + 2] = 255; gd[i + 3] = g;
      }
      if (b > 3) {
        bd[i] = 255; bd[i + 1] = 255; bd[i + 2] = 255; bd[i + 3] = b;
      }
    }

    rCtx.putImageData(rData, 0, 0);
    gCtx.putImageData(gData, 0, 0);
    bCtx.putImageData(bData, 0, 0);

    var rQuarter = createOffscreenCanvas(qW, qH);
    var gQuarter = createOffscreenCanvas(qW, qH);
    if (rQuarter && gQuarter) {
      var rqCtx = rQuarter.getContext('2d');
      var gqCtx = gQuarter.getContext('2d');
      rqCtx.drawImage(rCanvas, 0, 0, qW, qH);
      gqCtx.drawImage(gCanvas, 0, 0, qW, qH);
    }

    entry.channels = {
      rFull: rCanvas,
      gFull: gCanvas,
      bFull: bCanvas,
      rQuarter: rQuarter || rCanvas,
      gQuarter: gQuarter || gCanvas
    };
  };

  StageCanvasSystem.prototype._getTintedChannel = function (stageId, chanKey, alphaCanvas, hexColor) {
    if (!alphaCanvas) return null;
    var key = stageId + ':' + chanKey + ':' + hexColor;
    var cached = this._tintedChannelCache.get(key);
    if (cached) return cached;

    var out = createOffscreenCanvas(alphaCanvas.width, alphaCanvas.height);
    if (!out) return null;
    var ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(alphaCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'source-over';

    if (this._tintedChannelCache.size > 48) {
      var firstKey = this._tintedChannelCache.keys().next().value;
      this._tintedChannelCache.delete(firstKey);
    }
    this._tintedChannelCache.set(key, out);
    return out;
  };

  StageCanvasSystem.prototype._getScreenTile = function (kind, color, pitch, dotScale) {
    var qScale = Math.round(dotScale * 10) / 10;
    var qPitch = Math.max(6, Math.round(pitch));
    var key = kind + '|' + color + '|' + qPitch + '|' + qScale;
    var cached = this._tileCache.get(key);
    if (cached) return cached;

    var tile = createOffscreenCanvas(qPitch, qPitch);
    if (!tile) return null;
    var tctx = tile.getContext('2d');
    if (!tctx) return null;

    tctx.fillStyle = color;
    tctx.strokeStyle = color;
    var half = qPitch * 0.5;

    if (kind === 'cross') {
      var arm = Math.max(2, qPitch * 0.28 * qScale);
      var thick = Math.max(1.2, qPitch * 0.13 * qScale);
      tctx.fillRect(half - arm, half - thick * 0.5, arm * 2, thick);
      tctx.fillRect(half - thick * 0.5, half - arm, thick, arm * 2);
    } else if (kind === 'line') {
      var lineH = Math.max(1.3, qPitch * 0.24 * qScale);
      tctx.fillRect(0, half - lineH * 0.5, qPitch, lineH);
    } else if (kind === 'square') {
      var side = Math.max(2, qPitch * 0.44 * qScale);
      tctx.fillRect(half - side * 0.5, half - side * 0.5, side, side);
    } else {
      var radius = Math.max(1.2, qPitch * 0.24 * qScale);
      tctx.beginPath();
      tctx.arc(half, half, radius, 0, Math.PI * 2);
      tctx.fill();
    }

    if (this._tileCache.size > 80) {
      var oldest = this._tileCache.keys().next().value;
      this._tileCache.delete(oldest);
    }
    this._tileCache.set(key, tile);
    return tile;
  };

  StageCanvasSystem.prototype._fillRotatedScreen = function (ctx, width, height, opts) {
    var tile = this._getScreenTile(
      opts.kind || 'dot',
      opts.color || this._sumi,
      opts.pitch || 12,
      opts.dotScale || 1
    );
    if (!tile) return;

    var pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;

    var rad = ((opts.angleDeg || 0) * Math.PI) / 180;
    var diag = Math.hypot(width, height) + (opts.pitch || 12) * 4;
    var ox = opts.offsetX || 0;
    var oy = opts.offsetY || 0;

    ctx.save();
    if (opts.composite) ctx.globalCompositeOperation = opts.composite;
    ctx.globalAlpha = opts.alpha !== undefined ? opts.alpha : 1;
    ctx.translate(width * 0.5 + ox, height * 0.5 + oy);
    ctx.rotate(rad);
    ctx.fillStyle = pattern;
    ctx.fillRect(-diag * 0.5, -diag * 0.5, diag, diag);
    ctx.restore();
  };

  StageCanvasSystem.prototype._readAudioFrame = function (stage, elapsedSec) {
    var raw = null;
    if (this._audio && typeof this._audio.getFrame === 'function') {
      try {
        raw = this._audio.getFrame();
      } catch (_e) {
        raw = null;
      }
    }

    var bpm = (raw && raw.bpm) || stage.measuredBpm || 128;
    var playing = Boolean(raw && (raw.playing || raw.isPlaying));
    var timeSec = (raw && typeof raw.currentTime === 'number') ? raw.currentTime
      : (raw && typeof raw.timeSec === 'number') ? raw.timeSec
        : (raw && typeof raw.time === 'number') ? raw.time
          : elapsedSec;

    var timing = findBeatTiming(stage.beatTimesSec, timeSec || 0, bpm, stage.durationSec);
    var beatIndex = (raw && typeof raw.beatIndex === 'number' && playing) ? raw.beatIndex : timing.beatIndex;
    var beatPhase = (raw && typeof raw.beatPhase === 'number' && playing) ? raw.beatPhase : timing.beatPhase;
    var step16 = (raw && typeof raw.step16 === 'number')
      ? (raw.step16 & 15)
      : (raw && typeof raw.barPhase === 'number' && playing)
        ? (Math.floor(raw.barPhase * 16) & 15)
        : timing.step16;
    var beatPulse = (raw && typeof raw.onBeatPulse === 'number' && playing) ? raw.onBeatPulse
      : (raw && typeof raw.beatPulse === 'number') ? raw.beatPulse
        : (raw && typeof raw.pulse === 'number') ? raw.pulse
          : timing.beatPulse;

    var clamp = this._atlas.clamp;
    var bass = raw ? clamp(raw.bass !== undefined ? raw.bass : (raw.low || 0), 0, 1) : 0;
    var mid = raw ? clamp(raw.mid !== undefined ? raw.mid : (raw.mids || 0), 0, 1) : 0;
    var high = raw ? clamp(raw.high !== undefined ? raw.high : (raw.treble || 0), 0, 1) : 0;

    if (!playing) {
      // Gentle tempo-locked idle breath when audio is paused so night/active surfaces feel alive.
      var idleWave = 0.5 + 0.5 * Math.sin(elapsedSec * Math.PI * 0.85);
      bass = Math.max(bass, 0.14 * idleWave);
      mid = Math.max(mid, 0.12 * (0.5 + 0.5 * Math.cos(elapsedSec * Math.PI * 0.65)));
      high = Math.max(high, 0.08 * idleWave);
    }

    var rms = raw && typeof raw.energy === 'number' && playing
      ? clamp(raw.energy, 0, 1)
      : raw && typeof raw.rms === 'number'
        ? clamp(raw.rms, 0, 1)
        : clamp(bass * 0.5 + mid * 0.35 + high * 0.15, 0, 1);

    var waveform = raw ? (raw.waveBytes || raw.waveform || raw.timeDomain || raw.wave || null) : null;

    return {
      playing: playing,
      timeSec: timeSec || 0,
      bpm: bpm,
      beatIndex: beatIndex,
      beatPhase: beatPhase,
      step16: step16,
      beatPulse: clamp(beatPulse, 0, 1),
      bass: bass,
      mid: mid,
      high: high,
      rms: rms,
      waveform: waveform
    };
  };

  StageCanvasSystem.prototype._safeEnv = function (rawVal, bpm, dt, channelKey) {
    if (this._motion && typeof this._motion.safeMacroEnv === 'function') {
      return this._motion.safeMacroEnv(rawVal, bpm, dt, channelKey);
    }
    return this._atlas.safeMacroEnv(rawVal, bpm, dt, 0);
  };

  StageCanvasSystem.prototype._registerSurfaces = function () {
    if (!this._motion || typeof this._motion.registerSurface !== 'function') return;
    var self = this;

    if (this._els.heroBackCanvas) {
      this._motion.registerSurface('hero-back', {
        element: this._els.heroBackCanvas,
        priority: 40,
        onFrame: function (ctx) { self._renderHeroBack(ctx, true); },
        onStatic: function (ctx) { self._renderHeroBack(ctx, false); }
      });
    }

    if (this._els.heroMaskCanvas) {
      this._motion.registerSurface('hero-mask', {
        element: this._els.heroMaskCanvas,
        priority: 35,
        onFrame: function (ctx) { self._renderHeroMask(ctx, true); },
        onStatic: function (ctx) { self._renderHeroMask(ctx, false); }
      });
    }

    if (this._els.heroWipeCanvas) {
      this._motion.registerSurface('hero-wipe', {
        element: this._els.heroWipeCanvas,
        priority: 50,
        onFrame: function (ctx) { self._renderHeroWipe(ctx); },
        onStatic: function () { self._cancelAndClearWipe(); }
      });
    }

    if (this._els.scopeCanvas) {
      this._motion.registerSurface('scope', {
        element: this._els.scopeCanvas,
        priority: 20,
        onFrame: function (ctx) { self._renderScope(ctx, true); },
        onStatic: function (ctx) { self._renderScope(ctx, false); }
      });
    }

    if (this._els.passCanvas) {
      this._motion.registerSurface('pass', {
        element: this._els.passCanvas,
        priority: 10,
        onFrame: function (ctx) { self._renderPass(ctx, true); },
        onStatic: function (ctx) {
          self._passDirty = true;
          self._renderPass(ctx, false);
        }
      });
    }
  };

  StageCanvasSystem.prototype._renderHeroBack = function (frameCtx, animated) {
    var canvas = this._els.heroBackCanvas;
    if (!canvas) return;
    var geom = syncCanvasSize(canvas, frameCtx.dpr);
    if (!geom) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var stage = this._getStage(this._activeStageId);
    var isNight = this._hallMode === 'night';
    var w = geom.cssW;
    var h = geom.cssH;

    var px = 0;
    var py = 0;
    var bassEnv = 0;

    if (animated) {
      this._atlas.secondOrderStep(this._pointerSpringX, this._pointerTargetX, frameCtx.dt, 2.2, 0.78, 0);
      this._atlas.secondOrderStep(this._pointerSpringY, this._pointerTargetY, frameCtx.dt, 2.2, 0.78, 0);
      px = this._pointerSpringX.x;
      py = this._pointerSpringY.x;

      var af = this._readAudioFrame(stage, frameCtx.elapsed);
      bassEnv = this._safeEnv(af.bass * 0.7 + af.beatPulse * 0.3, af.bpm, frameCtx.dt, 'back-bass');
    }

    var pitchBase = frameCtx.qualityTier === 'low' ? 16 : (frameCtx.qualityTier === 'medium' ? 14 : 12);

    ctx.save();
    ctx.setTransform(geom.dpr, 0, 0, geom.dpr, 0, 0);

    if (this._saiMode) {
      this._renderHeroBackSai(ctx, w, h, isNight, pitchBase, px, py, bassEnv, frameCtx.elapsed, animated);
      ctx.restore();
      return;
    }

    if (!isNight) {
      ctx.fillStyle = this._paper;
      ctx.fillRect(0, 0, w, h);

      var offsetX = px * 8 + (animated ? Math.sin(frameCtx.elapsed * 0.6) * 2.5 : 0);
      var offsetY = py * 6;

      // Full-sheet rotated risograph undertone screen.
      this._fillRotatedScreen(ctx, w, h, {
        kind: stage.screenKind,
        angleDeg: stage.screenAngle,
        color: stage.dayInk,
        alpha: 0.16 + bassEnv * 0.08,
        pitch: pitchBase + 2,
        dotScale: 0.92 + bassEnv * 0.14,
        offsetX: offsetX,
        offsetY: offsetY
      });

      // Architectural riso poster plate offset behind the headliner.
      var plateX = Math.round(w * 0.12 + px * 4);
      var plateY = Math.round(h * 0.08 + py * 3);
      var plateW = Math.round(w * 0.76);
      var plateH = Math.round(h * 0.80);

      ctx.save();
      ctx.beginPath();
      ctx.rect(plateX, plateY, plateW, plateH);
      ctx.clip();

      ctx.fillStyle = hexToRgba(stage.dayInk, 0.14 + bassEnv * 0.05);
      ctx.fillRect(plateX, plateY, plateW, plateH);

      this._fillRotatedScreen(ctx, w, h, {
        kind: stage.screenKind,
        angleDeg: stage.screenAngle,
        color: stage.dayInk,
        alpha: 0.34 + bassEnv * 0.10,
        pitch: pitchBase,
        dotScale: 1.0 + bassEnv * 0.16,
        offsetX: -offsetX * 0.6,
        offsetY: -offsetY * 0.6
      });

      // Subtle sumi overprint ghost offset for riso registration character.
      this._fillRotatedScreen(ctx, w, h, {
        kind: stage.screenKind,
        angleDeg: stage.screenAngle + 3,
        color: this._sumi,
        alpha: 0.06,
        pitch: pitchBase + 4,
        dotScale: 0.75,
        offsetX: 2.5 + px * 2,
        offsetY: 2.5 + py * 2,
        composite: 'multiply'
      });
      ctx.restore();

      // 1px sumi keyline bounding low-paper-contrast yellow/emerald plates cleanly.
      ctx.strokeStyle = hexToRgba(this._sumi, 0.42);
      ctx.lineWidth = 1;
      ctx.strokeRect(plateX + 0.5, plateY + 0.5, plateW - 1, plateH - 1);

      drawCropMarks(ctx, plateX, plateY, plateW, plateH, 10, 4, hexToRgba(this._sumi, 0.55), 1);
    } else {
      ctx.fillStyle = stage.nightBg || SAI_NIGHT_BG;
      ctx.fillRect(0, 0, w, h);

      var nOffX = px * 10;
      var nOffY = py * 7;

      // Crisp night-hall halftone stage screen (no muddy radial blobs).
      this._fillRotatedScreen(ctx, w, h, {
        kind: stage.screenKind,
        angleDeg: stage.screenAngle,
        color: stage.nightLight,
        alpha: 0.12 + bassEnv * 0.14,
        pitch: pitchBase,
        dotScale: 0.85 + bassEnv * 0.22,
        offsetX: nOffX,
        offsetY: nOffY
      });

      // Angled stage louver light beam clipped inside clean polygon.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.22 + px * 12, 0);
      ctx.lineTo(w * 0.78 + px * 12, 0);
      ctx.lineTo(w * 0.94 - px * 6, h);
      ctx.lineTo(w * 0.06 - px * 6, h);
      ctx.closePath();
      ctx.clip();

      this._fillRotatedScreen(ctx, w, h, {
        kind: stage.screenKind,
        angleDeg: stage.screenAngle,
        color: stage.emissiveHex,
        alpha: 0.09 + bassEnv * 0.12,
        pitch: pitchBase - 2,
        dotScale: 0.9 + bassEnv * 0.18,
        offsetX: -nOffX * 0.5,
        offsetY: -nOffY * 0.5,
        composite: 'screen'
      });
      ctx.restore();

      // Architectural truss hairline rules in stage night light.
      ctx.strokeStyle = hexToRgba(stage.nightLight, 0.24 + bassEnv * 0.14);
      ctx.lineWidth = 1;
      var margin = Math.round(Math.min(w, h) * 0.06);
      ctx.strokeRect(margin + 0.5, margin + 0.5, w - margin * 2 - 1, h - margin * 2 - 1);
      drawCropMarks(ctx, margin, margin, w - margin * 2, h - margin * 2, 10, 4, hexToRgba(stage.nightLight, 0.55), 1);
    }

    ctx.restore();
  };

  StageCanvasSystem.prototype._renderHeroBackSai = function (ctx, w, h, isNight, pitchBase, px, py, bassEnv, elapsed, animated) {
    ctx.fillStyle = isNight ? SAI_NIGHT_BG : this._paper;
    ctx.fillRect(0, 0, w, h);

    var stages = this._stages;
    var count = stages.length || 1;
    var bandW = w / count;

    for (var i = 0; i < count; i++) {
      var st = stages[i];
      var color = isNight ? st.nightLight : st.dayInk;
      var shift = animated ? Math.sin(elapsed * 0.7 + i * 1.4) * 3 : 0;

      // Full-field subtle 4-plate overprint creating authentic risograph composite moire.
      this._fillRotatedScreen(ctx, w, h, {
        kind: st.screenKind,
        angleDeg: st.screenAngle,
        color: color,
        alpha: (isNight ? 0.10 : 0.13) + bassEnv * 0.05,
        pitch: pitchBase + 2,
        dotScale: 0.85 + bassEnv * 0.12,
        offsetX: px * (4 + i * 2) + shift,
        offsetY: py * (3 + i * 1.5),
        composite: isNight ? 'screen' : 'multiply'
      });

      // Vertical festival column register band per stage.
      var bx = Math.round(i * bandW);
      var bw = Math.ceil(bandW);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx + 8, Math.round(h * 0.08), bw - 16, Math.round(h * 0.84));
      ctx.clip();

      this._fillRotatedScreen(ctx, w, h, {
        kind: st.screenKind,
        angleDeg: st.screenAngle,
        color: color,
        alpha: (isNight ? 0.18 : 0.22) + bassEnv * 0.08,
        pitch: pitchBase,
        dotScale: 0.95,
        offsetX: px * 5,
        offsetY: py * 4
      });
      ctx.restore();

      ctx.strokeStyle = hexToRgba(isNight ? color : this._sumi, isNight ? 0.35 : 0.28);
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 8.5, Math.round(h * 0.08) + 0.5, bw - 17, Math.round(h * 0.84) - 1);
    }
  };

  StageCanvasSystem.prototype._renderHeroMask = function (frameCtx, animated) {
    var canvas = this._els.heroMaskCanvas;
    if (!canvas) return;
    var geom = syncCanvasSize(canvas, frameCtx.dpr);
    if (!geom) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(geom.dpr, 0, 0, geom.dpr, 0, 0);
    ctx.clearRect(0, 0, geom.cssW, geom.cssH);

    var stage = this._getStage(this._activeStageId);
    var entry = this._maskCache[stage.id];
    var fit = computeCharacterFitRect(canvas, this._els.heroImgEl, geom.cssW, geom.cssH);

    var af = this._readAudioFrame(stage, frameCtx.elapsed);
    var bassEnv = animated ? this._safeEnv(af.bass * 0.65 + af.beatPulse * 0.35, af.bpm, frameCtx.dt, 'mask-r') : 0.18;
    var midEnv = animated ? this._safeEnv(af.mid * 0.7 + af.beatPulse * 0.3, af.bpm, frameCtx.dt, 'mask-g') : 0.22;
    var highEnv = animated ? this._safeEnv(af.high * 0.75 + af.rms * 0.25, af.bpm, frameCtx.dt, 'mask-b') : 0.20;

    var isNight = this._hallMode === 'night';

    if (entry && entry.loaded) {
      if (entry.channels) {
        var ch = entry.channels;
        if (!isNight) {
          // Day Hall: subtle risograph multiply dot-gain overprint (R equipment, G rim, B catchlight).
          var rDay = this._getTintedChannel(stage.id, 'rFull', ch.rFull, stage.dayInk);
          var gDay = this._getTintedChannel(stage.id, 'gFull', ch.gFull, stage.dayInk);
          var bDay = this._getTintedChannel(stage.id, 'bFull', ch.bFull, '#FFFDF7');

          if (rDay) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.14 + bassEnv * 0.10;
            ctx.drawImage(rDay, fit.x, fit.y, fit.w, fit.h);
          }
          if (gDay) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.18 + midEnv * 0.12;
            ctx.drawImage(gDay, fit.x, fit.y, fit.w, fit.h);
          }
          if (bDay) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.34 + highEnv * 0.22;
            ctx.drawImage(bDay, fit.x, fit.y, fit.w, fit.h);
          }
        } else {
          // Night Hall (暗転): ignite pixel-locked R bass plane, G rim bloom, B visor twinkle.
          var useBloom = frameCtx.qualityTier !== 'low';
          var rBloom = useBloom ? this._getTintedChannel(stage.id, 'rQ', ch.rQuarter, stage.nightLight) : null;
          var rSharp = this._getTintedChannel(stage.id, 'rFull', ch.rFull, stage.emissiveHex);
          var gBloom = useBloom ? this._getTintedChannel(stage.id, 'gQ', ch.gQuarter, stage.emissiveHex) : null;
          var gSharp = this._getTintedChannel(stage.id, 'gFull', ch.gFull, stage.nightLight);
          var bSpark = this._getTintedChannel(stage.id, 'bFull', ch.bFull, '#FFFFFF');
          var bHalo = this._getTintedChannel(stage.id, 'bFullEm', ch.bFull, stage.emissiveHex);

          ctx.globalCompositeOperation = 'lighter';
          if (rBloom) {
            ctx.globalAlpha = 0.24 + bassEnv * 0.24;
            ctx.drawImage(rBloom, fit.x - 2, fit.y - 2, fit.w + 4, fit.h + 4);
          }
          if (rSharp) {
            ctx.globalAlpha = 0.22 + bassEnv * 0.22;
            ctx.drawImage(rSharp, fit.x, fit.y, fit.w, fit.h);
          }
          if (gBloom) {
            ctx.globalAlpha = 0.32 + midEnv * 0.28;
            ctx.drawImage(gBloom, fit.x - 1.5, fit.y - 1.5, fit.w + 3, fit.h + 3);
          }
          if (gSharp) {
            ctx.globalAlpha = 0.44 + midEnv * 0.30;
            ctx.drawImage(gSharp, fit.x, fit.y, fit.w, fit.h);
          }
          if (bHalo) {
            ctx.globalAlpha = 0.40 + highEnv * 0.28;
            ctx.drawImage(bHalo, fit.x - 1, fit.y - 1, fit.w + 2, fit.h + 2);
          }
          if (bSpark) {
            ctx.globalAlpha = 0.52 + highEnv * 0.32;
            ctx.drawImage(bSpark, fit.x, fit.y, fit.w, fit.h);
          }
        }
      } else if (entry.img) {
        ctx.globalCompositeOperation = isNight ? 'screen' : 'multiply';
        ctx.globalAlpha = isNight ? (0.35 + bassEnv * 0.25) : 0.14;
        ctx.drawImage(entry.img, fit.x, fit.y, fit.w, fit.h);
      }
    }

    if (isNight && Array.isArray(stage.gearPaths) && stage.gearPaths.length > 0) {
      this._renderGearFilaments(ctx, stage, fit, af, midEnv, highEnv, frameCtx.elapsed, animated, frameCtx.qualityTier);
    }

    ctx.restore();
  };

  StageCanvasSystem.prototype._renderGearFilaments = function (ctx, stage, fit, af, midEnv, highEnv, elapsed, animated, qualityTier) {
    var paths = stage.gearPaths;
    var samples = qualityTier === 'low' ? 6 : 12;
    var tailSpan = 0.24;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var p = 0; p < paths.length; p++) {
      var pts = paths[p];
      if (!pts || pts.length < 2) continue;

      if (!animated) {
        // Static Night anchor: crisp luminous cable trace + terminal sparks without animation.
        ctx.beginPath();
        for (var s = 0; s <= 10; s++) {
          var sp = this._atlas.samplePath(pts, s / 10);
          var sx = fit.x + sp.x * fit.w;
          var sy = fit.y + sp.y * fit.h;
          if (s === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = hexToRgba(stage.emissiveHex, 0.38);
        ctx.lineWidth = Math.max(1.5, fit.w * 0.004);
        ctx.stroke();

        var headStatic = this._atlas.samplePath(pts, 0.5);
        ctx.fillStyle = hexToRgba('#FFFDF7', 0.72);
        ctx.beginPath();
        ctx.arc(fit.x + headStatic.x * fit.w, fit.y + headStatic.y * fit.h, Math.max(2, fit.w * 0.006), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Clocked to audio beat grid (and capped cleanly when paused) for rhythmic cable impulses.
      var cycle = af.playing
        ? ((af.beatIndex + af.beatPhase) * 0.25 + p * 0.31)
        : (elapsed * Math.min(1.1, (af.bpm || 128) / 180) + p * 0.37);
      var headU = cycle - Math.floor(cycle);

      for (var k = 0; k < samples; k++) {
        var frac0 = k / samples;
        var frac1 = (k + 1) / samples;
        var u0 = headU - (1 - frac0) * tailSpan;
        var u1 = headU - (1 - frac1) * tailSpan;
        if (u1 < 0 || u0 > 1) continue;

        var a = this._atlas.samplePath(pts, this._atlas.clamp(u0, 0, 1));
        var b = this._atlas.samplePath(pts, this._atlas.clamp(u1, 0, 1));
        var ax = fit.x + a.x * fit.w;
        var ay = fit.y + a.y * fit.h;
        var bx = fit.x + b.x * fit.w;
        var by = fit.y + b.y * fit.h;

        var segAlpha = frac1 * frac1 * (0.38 + midEnv * 0.38);
        ctx.strokeStyle = hexToRgba(stage.emissiveHex, segAlpha);
        ctx.lineWidth = Math.max(1.5, fit.w * (0.003 + 0.006 * frac1));
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();

        ctx.strokeStyle = hexToRgba('#FFFDF7', segAlpha * 0.75);
        ctx.lineWidth = Math.max(0.8, fit.w * (0.0014 + 0.0022 * frac1));
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      var head = this._atlas.samplePath(pts, headU);
      var hx = fit.x + head.x * fit.w;
      var hy = fit.y + head.y * fit.h;
      var sparkR = Math.max(2.2, fit.w * (0.0055 + highEnv * 0.004));

      ctx.fillStyle = hexToRgba(stage.emissiveHex, 0.55 + highEnv * 0.3);
      ctx.beginPath();
      ctx.arc(hx, hy, sparkR * 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = hexToRgba('#FFFDF7', 0.85);
      ctx.beginPath();
      ctx.arc(hx, hy, sparkR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  StageCanvasSystem.prototype._cancelAndClearWipe = function () {
    this._wipeToken += 1;
    this._wipe = null;
    var canvas = this._els.heroWipeCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  StageCanvasSystem.prototype._renderHeroWipe = function (frameCtx) {
    var canvas = this._els.heroWipeCanvas;
    if (!canvas) return;

    if (!this._wipe) {
      var idleCtx = canvas.getContext('2d');
      if (idleCtx && canvas.width > 0 && canvas.height > 0) {
        idleCtx.setTransform(1, 0, 0, 1, 0, 0);
        idleCtx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    if (!this._motion || !this._motion.isMotionEnabled()) {
      this._cancelAndClearWipe();
      return;
    }

    var geom = syncCanvasSize(canvas, frameCtx.dpr);
    if (!geom) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var wipe = this._wipe;
    if (wipe.startMs === null) {
      wipe.startMs = frameCtx.now;
    }

    var rawU = this._atlas.clamp((frameCtx.now - wipe.startMs) / wipe.durationMs, 0, 1);
    ctx.save();
    ctx.setTransform(geom.dpr, 0, 0, geom.dpr, 0, 0);
    ctx.clearRect(0, 0, geom.cssW, geom.cssH);

    if (rawU >= 1) {
      this._wipe = null;
      ctx.restore();
      return;
    }

    var w = geom.cssW;
    var h = geom.cssH;
    var isNight = this._hallMode === 'night';
    var fromSt = wipe.fromStage;
    var toSt = wipe.toStage;

    // Angled North-Sea-Jazz venetian-blinds louver slats with 1-beat dual-angle moire overlap.
    var slatCount = frameCtx.qualityTier === 'low' ? 8 : 12;
    var tiltRad = (-14 * Math.PI) / 180;
    var diag = Math.hypot(w, h) + 60;
    var slatW = diag / slatCount;

    var fromColor = isNight ? fromSt.nightLight : fromSt.dayInk;
    var toColor = isNight ? toSt.nightLight : toSt.dayInk;
    var groundColor = isNight ? toSt.nightBg : this._paper;
    var edgeColor = isNight ? toSt.emissiveHex : this._sumi;

    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(tiltRad);

    for (var i = 0; i < slatCount; i++) {
      var localU = this._atlas.phase(rawU, (i / slatCount) * 0.24, 0.76);
      var snapped = this._atlas.easings.mechanicalSnap(localU);
      // Shutter opens to full blade cover near middle of beat, then clears cleanly out.
      var bladeCoverage = Math.sin(snapped * Math.PI);
      if (bladeCoverage < 0.02) continue;

      var sx = -diag * 0.5 + i * slatW;
      var bw = slatW * bladeCoverage * 1.04;
      var xPos = sx + (slatW - bw) * (snapped < 0.5 ? 0 : 1);

      ctx.save();
      ctx.beginPath();
      ctx.rect(xPos, -diag * 0.5, bw, diag);
      ctx.clip();

      ctx.fillStyle = hexToRgba(groundColor, 0.42 * bladeCoverage);
      ctx.fillRect(xPos, -diag * 0.5, bw, diag);

      // Outgoing stage halftone angle overlapping incoming stage angle -> moire beat.
      ctx.rotate(-tiltRad);
      ctx.translate(-w * 0.5, -h * 0.5);

      this._fillRotatedScreen(ctx, w, h, {
        kind: fromSt.screenKind,
        angleDeg: fromSt.screenAngle,
        color: fromColor,
        alpha: 0.34 * (1 - snapped * 0.65) * bladeCoverage,
        pitch: 10,
        dotScale: 1.05,
        offsetX: (1 - snapped) * 14,
        offsetY: 0
      });

      this._fillRotatedScreen(ctx, w, h, {
        kind: toSt.screenKind,
        angleDeg: toSt.screenAngle,
        color: toColor,
        alpha: 0.38 * (0.35 + snapped * 0.65) * bladeCoverage,
        pitch: 10,
        dotScale: 1.05,
        offsetX: -snapped * 14,
        offsetY: 0,
        composite: isNight ? 'screen' : 'multiply'
      });

      ctx.restore();

      // Razor-sharp mekuri louver leading edge.
      ctx.strokeStyle = hexToRgba(edgeColor, 0.48 * bladeCoverage);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(xPos, -diag * 0.5);
      ctx.lineTo(xPos, diag * 0.5);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  };

  StageCanvasSystem.prototype._renderScope = function (frameCtx, animated) {
    var canvas = this._els.scopeCanvas;
    if (!canvas) return;
    var geom = syncCanvasSize(canvas, frameCtx.dpr);
    if (!geom) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var stage = this._getStage(this._activeStageId);
    var isNight = this._hallMode === 'night';
    var w = geom.cssW;
    var h = geom.cssH;

    var bg = isNight ? (stage.nightBg || SAI_NIGHT_BG) : this._paper;
    var ink = isNight ? this._paper : this._sumi;
    var accent = isNight ? stage.emissiveHex : stage.dayInk;
    var accentSecondary = isNight ? stage.nightLight : this._sumi;

    var af = this._readAudioFrame(stage, animated ? frameCtx.elapsed : 0);
    var safeEnergy = animated
      ? this._safeEnv(af.rms * 0.75 + af.beatPulse * 0.25, af.bpm, frameCtx.dt, 'scope-rms')
      : 0.35;

    ctx.save();
    ctx.setTransform(geom.dpr, 0, 0, geom.dpr, 0, 0);

    // Clean editorial paper/night ground with crisp ink rules (zero neon HUD clutter).
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    var pad = Math.max(10, Math.round(Math.min(w, h) * 0.05));
    var innerW = Math.max(40, w - pad * 2);
    var innerH = Math.max(40, h - pad * 2);

    ctx.strokeStyle = hexToRgba(ink, 0.55);
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 0.5, pad + 0.5, innerW - 1, innerH - 1);

    var headerH = 20;
    var gridH = Math.max(30, Math.round(innerH * 0.27));
    var topZoneY = pad + headerH;
    var topZoneH = Math.max(36, innerH - headerH - gridH - 8);
    var lissSize = Math.min(topZoneH, Math.round(innerW * 0.30));
    var waveW = Math.max(40, innerW - lissSize - 10);

    // Header telemetry bar.
    ctx.fillStyle = hexToRgba(ink, 0.85);
    ctx.font = '600 10px "M PLUS 1 Code", monospace';
    ctx.textBaseline = 'middle';
    var stepLabel = String((animated ? af.step16 : 0) + 1).padStart(2, '0');
    var headerText = stage.num + ' ' + stage.code + ' · ' + Number(stage.measuredBpm || 128).toFixed(2) +
      ' BPM · ' + (stage.measuredKey || 'F minor').toUpperCase() + ' · STEP ' + stepLabel + '/16';
    ctx.fillText(headerText, pad + 8, pad + headerH * 0.5);

    ctx.beginPath();
    ctx.moveTo(pad, topZoneY + 0.5);
    ctx.lineTo(pad + innerW, topZoneY + 0.5);
    ctx.strokeStyle = hexToRgba(ink, 0.25);
    ctx.stroke();

    // Oscilloscope waveform panel (left).
    var waveX = pad + 6;
    var waveY = topZoneY + 4;
    var waveH = Math.max(24, topZoneH - 8);
    var waveMidY = waveY + waveH * 0.5;

    ctx.strokeStyle = hexToRgba(ink, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(waveX, waveMidY + 0.5);
    ctx.lineTo(waveX + waveW, waveMidY + 0.5);
    for (var v = 1; v < 4; v++) {
      var gx = Math.round(waveX + (waveW * v) / 4) + 0.5;
      ctx.moveTo(gx, waveY);
      ctx.lineTo(gx, waveY + waveH);
    }
    ctx.stroke();

    var samples = frameCtx.qualityTier === 'low' ? 64 : 128;
    var wf = af.waveform;
    var stageFreq = 2 + (stage.index || 0) * 0.85;
    var tPhase = animated ? frameCtx.elapsed * (af.playing ? 5.2 : 1.4) : 0;

    ctx.beginPath();
    for (var s = 0; s < samples; s++) {
      var u = s / (samples - 1);
      var sampleVal = 0;

      if (animated && wf && wf.length > 0 && af.playing) {
        var idx = Math.min(wf.length - 1, Math.floor(u * wf.length));
        var rawSample = wf[idx];
        sampleVal = (wf instanceof Uint8Array) ? ((rawSample - 128) / 128) : rawSample;
        sampleVal = this._atlas.clamp(sampleVal, -1, 1);
      } else {
        // Deterministic musical score waveform for MOTION OFF / paused monitor.
        var env = Math.sin(u * Math.PI);
        var harmonic = this._atlas.waveMode(u * stageFreq, 0.25 + (stage.index || 0) * 0.18, tPhase, 1.4, 0.72);
        var carrier = Math.sin(u * Math.PI * (6 + (stage.index || 0) * 2) + tPhase) * 0.42;
        sampleVal = (harmonic * 0.65 + carrier * 0.35) * env * (0.55 + safeEnergy * 0.45);
      }

      var px = waveX + u * waveW;
      var py = waveMidY + sampleVal * (waveH * 0.42);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.strokeStyle = isNight ? accent : this._sumi;
    ctx.lineWidth = isNight ? 1.8 : 1.6;
    ctx.stroke();

    if (!isNight) {
      // Crisp colored ink overprint shadow trace in Day mode.
      ctx.strokeStyle = hexToRgba(accent, 0.65);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Lissajous phase ring panel (right).
    var lissX = pad + innerW - lissSize - 4;
    var lissY = topZoneY + Math.round((topZoneH - lissSize) * 0.5);
    var lcx = lissX + lissSize * 0.5;
    var lcy = lissY + lissSize * 0.5;
    var lr = Math.max(10, lissSize * 0.40);

    ctx.strokeStyle = hexToRgba(ink, 0.24);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lcx, lcy, lr, 0, Math.PI * 2);
    ctx.stroke();

    var ratios = [[3, 2], [4, 3], [5, 4], [3, 4]];
    var pair = ratios[(stage.index || 0) % ratios.length];
    var lissPhase = animated ? (af.beatPhase * Math.PI * 2 + frameCtx.elapsed * 0.45) : (Math.PI * 0.25);
    var lissSteps = frameCtx.qualityTier === 'low' ? 60 : 96;
    var lissAmp = lr * (0.72 + safeEnergy * 0.22);

    ctx.beginPath();
    for (var k = 0; k <= lissSteps; k++) {
      var th = (k / lissSteps) * Math.PI * 2;
      var lx = lcx + Math.sin(pair[0] * th + lissPhase) * lissAmp;
      var ly = lcy + Math.sin(pair[1] * th) * lissAmp;
      if (k === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 16-step quantized phase beat grid (bottom strip).
    var gridY = topZoneY + topZoneH + 4;
    var gridX = pad + 6;
    var gridW = innerW - 12;
    var cellGap = 3;
    var cellW = (gridW - cellGap * 15) / 16;
    var cellH = Math.max(14, gridH - 10);

    var activeStep = animated ? af.step16 : -1;

    for (var step = 0; step < 16; step++) {
      var cx = gridX + step * (cellW + cellGap);
      var isDownbeat = (step % 4 === 0);
      var isActive = step === activeStep;
      var isStaticAccent = !animated && (isDownbeat || ((step + (stage.index || 0)) % 4 === 2));

      if (isActive) {
        ctx.fillStyle = accent;
        ctx.fillRect(cx, gridY, cellW, cellH);
      } else if (isStaticAccent) {
        ctx.fillStyle = hexToRgba(accent, isDownbeat ? 0.85 : 0.28);
        ctx.fillRect(cx, gridY, cellW, cellH);
      } else {
        ctx.fillStyle = hexToRgba(ink, isDownbeat ? 0.14 : 0.05);
        ctx.fillRect(cx, gridY, cellW, cellH);
      }

      ctx.strokeStyle = hexToRgba(isActive ? accentSecondary : ink, isDownbeat ? 0.65 : 0.30);
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(cx) + 0.5, Math.round(gridY) + 0.5, Math.max(2, Math.round(cellW) - 1), Math.round(cellH) - 1);

      if (isDownbeat) {
        ctx.fillStyle = isActive ? (isNight ? this._sumi : stage.dayPlateText || this._sumi) : hexToRgba(ink, 0.72);
        ctx.font = '700 8px "M PLUS 1 Code", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(step / 4 + 1), cx + cellW * 0.5, gridY + cellH * 0.5 + 0.5);
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();
  };

  StageCanvasSystem.prototype._renderPass = function (frameCtx, animated) {
    var canvas = this._els.passCanvas;
    if (!canvas) return;

    var tiltX = this._passSeed.tiltX;
    var tiltY = this._passSeed.tiltY;

    if (animated) {
      this._atlas.secondOrderStep(this._passTiltSpringX, tiltX, frameCtx.dt, 2.5, 0.78, 0);
      this._atlas.secondOrderStep(this._passTiltSpringY, tiltY, frameCtx.dt, 2.5, 0.78, 0);
      var settling =
        Math.abs(this._passTiltSpringX.x - tiltX) > 0.004 ||
        Math.abs(this._passTiltSpringY.x - tiltY) > 0.004 ||
        Math.abs(this._passTiltSpringX.v) > 0.01 ||
        Math.abs(this._passTiltSpringY.v) > 0.01;
      if (!this._passDirty && !settling) return;
      tiltX = this._passTiltSpringX.x;
      tiltY = this._passTiltSpringY.x;
    } else {
      if (!this._passDirty) return;
      tiltX = this._passSeed.tiltX;
      tiltY = this._passSeed.tiltY;
    }

    this._passDirty = false;
    var geom = syncCanvasSize(canvas, 1, PASS_W * 2, PASS_H * 2);
    if (!geom) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var stage = this._getStage(this._passSeed.stageId || this._activeStageId);
    var handle = sanitizeHandle(this._passSeed.handle);
    var seedStr = handle + ':' + stage.id + ':' + (this._saiMode ? 'SAI' : stage.num);
    var h0 = this._atlas.hash(seedStr + ':0');
    var h1 = this._atlas.hash(seedStr + ':1');
    var h2 = this._atlas.hash(seedStr + ':2');
    var serialNum = String(Math.floor(h0 * 8999) + 1000);

    var w = PASS_W;
    var h = PASS_H;
    var paper = this._paper;
    var sumi = this._sumi;
    var isNight = this._hallMode === 'night';

    ctx.save();
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    // Printable heavy cream card stock ground.
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);

    var bleed = 24;
    var cardX = bleed;
    var cardY = bleed;
    var cardW = w - bleed * 2;
    var cardH = h - bleed * 2;

    // Micro-dot halftone ground + pointer-tilt moire interference ink sheen.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cardX, cardY, cardW, cardH);
    ctx.clip();

    this._fillRotatedScreen(ctx, w, h, {
      kind: stage.screenKind,
      angleDeg: stage.screenAngle,
      color: stage.dayInk,
      alpha: 0.11,
      pitch: 10,
      dotScale: 0.78,
      offsetX: tiltX * 6,
      offsetY: tiltY * 5
    });

    this._fillRotatedScreen(ctx, w, h, {
      kind: 'dot',
      angleDeg: stage.screenAngle + 7 + tiltX * 4,
      color: isNight ? stage.emissiveHex : sumi,
      alpha: 0.08,
      pitch: 9,
      dotScale: 0.72,
      offsetX: -tiltX * 9,
      offsetY: -tiltY * 7,
      composite: 'multiply'
    });

    // Left monumental stage ink plate column.
    var plateW = 248;
    ctx.fillStyle = stage.dayInk;
    ctx.fillRect(cardX, cardY, plateW, cardH);

    // Moire foil sheen stripe shifting with pointer tilt across stage plate.
    var sheenX = cardX + plateW * (0.5 + tiltX * 0.35);
    var grad = ctx.createLinearGradient(sheenX - 70, cardY, sheenX + 70, cardY + cardH);
    grad.addColorStop(0, hexToRgba(stage.emissiveHex, 0));
    grad.addColorStop(0.5, hexToRgba(stage.emissiveHex, isNight ? 0.34 : 0.22));
    grad.addColorStop(1, hexToRgba(stage.emissiveHex, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(cardX, cardY, plateW, cardH);

    // 4-plate header strip in SAI mode.
    if (this._saiMode && this._stages.length > 0) {
      var sw = plateW / this._stages.length;
      for (var si = 0; si < this._stages.length; si++) {
        ctx.fillStyle = this._stages[si].dayInk;
        ctx.fillRect(cardX + si * sw, cardY, Math.ceil(sw), 18);
      }
    }

    var plateTextColor = stage.dayPlateText || sumi;

    // Stage number & code on left plate.
    ctx.fillStyle = plateTextColor;
    ctx.font = '700 16px "M PLUS 1 Code", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(this._saiMode ? 'ALL · SAI' : ('STAGE ' + stage.num + ' · ' + stage.code), cardX + 20, cardY + 28);

    // Monumental stage kanji.
    ctx.font = '400 148px "Dela Gothic One", "Archivo", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._saiMode ? '祭' : stage.kanji, cardX + 46, cardY + 186);

    // Centered acoustic screen-angle emblem crest (untainted geometric vector).
    var embCx = cardX + plateW * 0.5;
    var embCy = cardY + 344;
    var embR = 56;
    var angleRad = ((stage.screenAngle || 0) * Math.PI) / 180;
    ctx.save();
    ctx.strokeStyle = hexToRgba(plateTextColor, 0.78);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(embCx, embCy, embR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = hexToRgba(stage.nightBg || sumi, 0.92);
    ctx.beginPath();
    ctx.arc(embCx, embCy, embR - 5, 0, Math.PI * 2);
    ctx.fill();

    // Concentric calibration rings rotated to stage screenAngle.
    ctx.strokeStyle = hexToRgba(stage.emissiveHex, 0.75);
    ctx.lineWidth = 1.4;
    for (var ringIdx = 0; ringIdx < 3; ringIdx++) {
      var rr = 22 + ringIdx * 10;
      var aStart = angleRad + ringIdx * 0.42;
      ctx.beginPath();
      ctx.arc(embCx, embCy, rr, aStart, aStart + Math.PI * 1.35);
      ctx.stroke();
    }

    // Center crosshair ticks & crisp stage mark.
    ctx.strokeStyle = hexToRgba(paper, 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(embCx - embR + 8, embCy);
    ctx.lineTo(embCx - 20, embCy);
    ctx.moveTo(embCx + 20, embCy);
    ctx.lineTo(embCx + embR - 8, embCy);
    ctx.stroke();

    ctx.fillStyle = paper;
    ctx.font = '800 17px "Archivo", "M PLUS 1 Code", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._saiMode ? 'SAI' : stage.num, embCx, embCy + 1);
    ctx.restore();

    // 3-chip calibrated ink swatch bar at bottom of left plate.
    var swatchColors = [stage.dayInk, stage.nightLight, stage.emissiveHex];
    var swY = cardY + cardH - 48;
    for (var sc = 0; sc < swatchColors.length; sc++) {
      var sx = cardX + 20 + sc * 70;
      ctx.fillStyle = swatchColors[sc];
      ctx.fillRect(sx, swY, 58, 22);
      ctx.strokeStyle = plateTextColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, swY + 0.5, 57, 21);
    }

    // Right credential area.
    var rightX = cardX + plateW + 28;
    var rightW = cardW - plateW - 52;

    // Guilloche security rosette via MotionAtlas.superformulaRadius().
    var rosCx = cardX + cardW - 118;
    var rosCy = cardY + 132;
    var mVal = 6 + Math.floor(h0 * 7) * 2;
    var n1Val = 0.65 + h1 * 1.1;
    var n2Val = 0.8 + h2 * 1.6;
    var n3Val = 0.8 + (1 - h1) * 1.6;

    ctx.save();
    var ringSpecs = [
      { scale: 76, alpha: 0.24, color: stage.dayInk, rot: tiltX * 0.22, lw: 1.2 },
      { scale: 56, alpha: 0.34, color: sumi, rot: -tiltY * 0.28 + 0.35, lw: 1.0 },
      { scale: 36, alpha: 0.42, color: stage.dayInk, rot: tiltX * 0.35 + 0.7, lw: 0.9 }
    ];
    for (var rIdx = 0; rIdx < ringSpecs.length; rIdx++) {
      var rs = ringSpecs[rIdx];
      ctx.beginPath();
      var steps = 220;
      for (var stp = 0; stp <= steps; stp++) {
        var theta = (stp / steps) * Math.PI * 2;
        var radNorm = this._atlas.superformulaRadius(theta, mVal, n1Val, n2Val, n3Val, 1, 1);
        var clampedR = Math.min(1.45, radNorm);
        var radPx = clampedR * rs.scale;
        var rx = rosCx + Math.cos(theta + rs.rot) * radPx;
        var ry = rosCy + Math.sin(theta + rs.rot) * radPx;
        if (stp === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.strokeStyle = hexToRgba(rs.color, rs.alpha);
      ctx.lineWidth = rs.lw;
      ctx.stroke();
    }
    ctx.restore();

    // Top credential masthead.
    ctx.fillStyle = sumi;
    ctx.font = '800 13px "Archivo", "M PLUS 1 Code", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('AI ULTRA MUSICFES 2026 // 響鳴電脳祭', rightX, cardY + 26);

    ctx.fillStyle = hexToRgba(sumi, 0.72);
    ctx.font = '600 11px "M PLUS 1 Code", monospace';
    ctx.fillText('BACKSTAGE PRESS CREDENTIAL · 校正刷り認証版', rightX, cardY + 48);

    // Keyline rule.
    ctx.strokeStyle = sumi;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rightX, cardY + 74);
    ctx.lineTo(rightX + rightW, cardY + 74);
    ctx.stroke();

    // Pass holder handle block.
    ctx.fillStyle = hexToRgba(sumi, 0.65);
    ctx.font = '600 10px "M PLUS 1 Code", monospace';
    ctx.fillText('BEARER HANDLE', rightX, cardY + 92);

    ctx.fillStyle = sumi;
    ctx.font = '800 40px "Archivo", "M PLUS 1 Code", monospace';
    ctx.fillText(handle, rightX, cardY + 112, rightW - 140);

    // Stage & artist assignment metadata.
    ctx.strokeStyle = hexToRgba(sumi, 0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rightX, cardY + 178);
    ctx.lineTo(rightX + rightW, cardY + 178);
    ctx.stroke();

    ctx.fillStyle = hexToRgba(sumi, 0.65);
    ctx.font = '600 10px "M PLUS 1 Code", monospace';
    ctx.fillText('ASSIGNED STAGE / HEADLINER', rightX, cardY + 194);

    ctx.fillStyle = sumi;
    ctx.font = '700 22px "Archivo", sans-serif';
    var stageLine = this._saiMode
      ? 'ALL 4 STAGES · FESTIVAL OVERVIEW'
      : (stage.stageName.toUpperCase() + ' · ' + stage.artistEn);
    ctx.fillText(stageLine, rightX, cardY + 214, rightW);

    ctx.fillStyle = hexToRgba(sumi, 0.85);
    ctx.font = '600 13px "M PLUS 1 Code", monospace';
    ctx.fillText(
      (this._saiMode ? '響 / 鳴 / 電 / 脳 全会場' : (stage.artistJa + ' · ' + stage.setTime)) +
      ' · ' + Number(stage.measuredBpm || 128).toFixed(1) + ' BPM',
      rightX,
      cardY + 248
    );

    // Deterministic press barcode.
    var barX = rightX;
    var barY = cardY + 296;
    var barH = 54;
    var rng = this._atlas.seedRandom(seedStr + ':barcode');
    var bxCursor = barX;
    ctx.fillStyle = sumi;
    while (bxCursor < barX + 260) {
      var bw = rng() > 0.62 ? 4 : 2;
      var gap = rng() > 0.5 ? 3 : 2;
      if (bxCursor + bw <= barX + 260) {
        ctx.fillRect(bxCursor, barY, bw, barH);
      }
      bxCursor += bw + gap;
    }

    ctx.font = '600 11px "M PLUS 1 Code", monospace';
    ctx.fillText('ID: UMF26-' + (this._saiMode ? '00' : stage.num) + '-' + serialNum + ' · ANGLE ' + stage.screenAngle + '° ' + String(stage.screenKind || 'dot').toUpperCase(), barX, barY + barH + 10);

    // Venue ink stamp: TOKYO BAYFRONT DOME 2026.
    var stampX = rightX + rightW - 236;
    var stampY = cardY + 372;
    var stampW = 236;
    var stampH = 84;

    ctx.save();
    ctx.strokeStyle = sumi;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(stampX + 1.5, stampY + 1.5, stampW - 3, stampH - 3);
    ctx.strokeStyle = stage.dayInk;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(stampX + 6.5, stampY + 6.5, stampW - 13, stampH - 13);

    ctx.fillStyle = sumi;
    ctx.font = '800 13px "Archivo", "M PLUS 1 Code", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOKYO BAYFRONT DOME 2026', stampX + stampW * 0.5, stampY + 20);
    ctx.font = '600 11px "M PLUS 1 Code", monospace';
    ctx.fillText('東京湾岸特設ドーム · 2026.11.23-24', stampX + stampW * 0.5, stampY + 42);
    ctx.fillStyle = sumi;
    ctx.font = '700 10px "M PLUS 1 Code", monospace';
    ctx.fillText('VERIFIED PRESS PASS // DO NOT DUPLICATE', stampX + stampW * 0.5, stampY + 62);
    ctx.restore();

    ctx.restore(); // End card clip

    // Outer card keyline + authentic 4-corner トンボ crop marks.
    ctx.strokeStyle = sumi;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
    drawCropMarks(ctx, cardX, cardY, cardW, cardH, 14, 5, sumi, 1.2);

    ctx.restore();
  };

  StageCanvasSystem.prototype.setStage = function (stageId, options) {
    if (this._disposed) return;
    var opts = options || {};
    var animate = opts.animate !== undefined ? Boolean(opts.animate) : true;
    if (!this._stageMap[stageId]) return;

    var prevStage = this._getStage(this._activeStageId);
    var nextStage = this._getStage(stageId);
    var changed = prevStage.id !== nextStage.id;

    this._activeStageId = nextStage.id;
    this._passSeed.stageId = nextStage.id;
    this._passDirty = true;

    this._preloadMask(nextStage);

    // Always advance monotonic wipeToken so any in-flight wipe is cancelled immediately.
    this._wipeToken += 1;
    var token = this._wipeToken;

    var canWipe = changed && animate && this._els.heroWipeCanvas && this._motion &&
      this._motion.isMotionEnabled() && this._motion.canTriggerBurst();

    if (canWipe) {
      this._motion.consumeBurst();
      this._wipeArmedCount += 1;
      var bpm = nextStage.measuredBpm || 128;
      var durationSec = Math.min(0.45, Math.max(0.24, 60 / bpm));
      this._wipe = {
        token: token,
        fromStage: prevStage,
        toStage: nextStage,
        startMs: null,
        durationMs: durationSec * 1000
      };
    } else {
      this._wipe = null;
      if (this._els.heroWipeCanvas) {
        var wCtx = this._els.heroWipeCanvas.getContext('2d');
        if (wCtx) {
          wCtx.setTransform(1, 0, 0, 1, 0, 0);
          wCtx.clearRect(0, 0, this._els.heroWipeCanvas.width, this._els.heroWipeCanvas.height);
        }
      }
    }

    if (this._motion && !this._motion.isMotionEnabled()) {
      this._motion.triggerStaticRender();
    }
  };

  StageCanvasSystem.prototype.setHallMode = function (mode) {
    if (this._disposed) return;
    var next = mode === 'night' ? 'night' : 'day';
    if (next === this._hallMode) return;
    this._hallMode = next;
    this._passDirty = true;
    if (this._motion && !this._motion.isMotionEnabled()) {
      this._motion.triggerStaticRender();
    }
  };

  StageCanvasSystem.prototype.setPointer = function (nx, ny) {
    if (this._disposed) return;
    this._pointerTargetX = this._atlas.clamp(Number(nx) || 0, -1, 1);
    this._pointerTargetY = this._atlas.clamp(Number(ny) || 0, -1, 1);
  };

  StageCanvasSystem.prototype.setPassSeed = function (seed) {
    if (this._disposed) return;
    var s = seed || {};
    if (s.handle !== undefined) this._passSeed.handle = sanitizeHandle(s.handle);
    if (s.stageId !== undefined && this._stageMap[s.stageId]) {
      this._passSeed.stageId = s.stageId;
    }
    if (s.tiltX !== undefined) this._passSeed.tiltX = this._atlas.clamp(Number(s.tiltX) || 0, -1, 1);
    if (s.tiltY !== undefined) this._passSeed.tiltY = this._atlas.clamp(Number(s.tiltY) || 0, -1, 1);
    this._passDirty = true;

    if (this._motion && !this._motion.isMotionEnabled()) {
      this._motion.triggerStaticRender('pass');
    }
  };

  StageCanvasSystem.prototype.setStageModeSai = function (isSai) {
    if (this._disposed) return;
    var next = Boolean(isSai);
    if (next === this._saiMode) return;
    this._saiMode = next;
    this._passDirty = true;
    this._wipeToken += 1;
    this._wipe = null;
    if (this._els.heroWipeCanvas) {
      var wCtx = this._els.heroWipeCanvas.getContext('2d');
      if (wCtx) {
        wCtx.setTransform(1, 0, 0, 1, 0, 0);
        wCtx.clearRect(0, 0, this._els.heroWipeCanvas.width, this._els.heroWipeCanvas.height);
      }
    }
    if (this._motion && !this._motion.isMotionEnabled()) {
      this._motion.triggerStaticRender();
    }
  };

  StageCanvasSystem.prototype.getState = function () {
    var masksCopy = Object.create(null);
    for (var id in this._masksLoaded) {
      if (Object.prototype.hasOwnProperty.call(this._masksLoaded, id)) {
        masksCopy[id] = this._masksLoaded[id];
      }
    }
    return {
      activeStageId: this._activeStageId,
      hallMode: this._hallMode,
      saiMode: this._saiMode,
      wiping: Boolean(this._wipe),
      wipeToken: this._wipeToken,
      wipeArmedCount: this._wipeArmedCount,
      masksLoaded: masksCopy
    };
  };

  StageCanvasSystem.prototype.dispose = function () {
    if (this._disposed) return;
    this._disposed = true;
    this._cancelAndClearWipe();

    if (this._motion && typeof this._motion.unregisterSurface === 'function') {
      this._motion.unregisterSurface('hero-back');
      this._motion.unregisterSurface('hero-mask');
      this._motion.unregisterSurface('hero-wipe');
      this._motion.unregisterSurface('scope');
      this._motion.unregisterSurface('pass');
    }

    if (typeof global.removeEventListener === 'function' && this._onResize) {
      global.removeEventListener('resize', this._onResize);
    }

    this._tileCache.clear();
    this._tintedChannelCache.clear();
  };

  ns.StageCanvasSystem = StageCanvasSystem;
})(window);
