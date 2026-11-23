/* Motion Atlas math primitives + unified RAF MotionEngine for AI ULTRA MUSICFES 2026.
 * Classic non-module script registering window.AIUMF.MotionAtlas and window.AIUMF.MotionEngine.
 */
(function (global) {
  'use strict';

  var ns = (global.AIUMF = global.AIUMF || {});

  var TAU = Math.PI * 2;
  var DEFAULT_MAX_DPR = 2;
  var WCAG_MAX_HZ = 1.6;
  var WCAG_MAX_FRAME_DELTA = 0.08;
  var BURST_COOLDOWN_MS = 650;

  var ASCII_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+-:#*=[]';
  var JP_GLYPHS = '響鳴電脳祭音拍光線波動鉄硝子深夜駅標号壱弐参肆';

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function phase(t, delay, span) {
    var d = delay || 0;
    var s = span === undefined ? 1 : span;
    if (s <= 0) return t >= d ? 1 : 0;
    return clamp((t - d) / s, 0, 1);
  }

  function smooth(t) {
    var u = clamp(t, 0, 1);
    return u * u * (3 - 2 * u);
  }

  function out(t) {
    var u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
  }

  function toSeedUint32(seed) {
    if (typeof seed === 'string') {
      var h = 2166136261 >>> 0;
      for (var i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h >>> 0;
    }
    if (typeof seed === 'number' && isFinite(seed)) {
      var n = (seed * 2654435761) | 0;
      return n >>> 0;
    }
    return 0x9e3779b9 >>> 0;
  }

  function hash(seed) {
    var x = (toSeedUint32(seed) + 0x6d2b79f5) >>> 0;
    x = Math.imul(x ^ (x >>> 15), x | 1) >>> 0;
    x ^= (x + Math.imul(x ^ (x >>> 7), x | 61)) >>> 0;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function seedRandom(seed) {
    var a = toSeedUint32(seed);
    return function nextRandom() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function spring(t, stiffness, damping) {
    if (t <= 0) return 0;
    var k = stiffness === undefined ? 180 : Math.max(1e-4, stiffness);
    var c = damping === undefined ? 18 : Math.max(0, damping);
    var omega0 = Math.sqrt(k);
    var zeta = c / (2 * omega0);

    if (zeta < 1 - 1e-5) {
      var omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      var env = Math.exp(-zeta * omega0 * t);
      return 1 - env * (Math.cos(omegaD * t) + (zeta * omega0 / omegaD) * Math.sin(omegaD * t));
    }
    if (zeta > 1 + 1e-5) {
      var root = Math.sqrt(zeta * zeta - 1);
      var r1 = -omega0 * (zeta - root);
      var r2 = -omega0 * (zeta + root);
      var c1 = r2 / (r2 - r1);
      var c2 = -r1 / (r2 - r1);
      return 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
    }
    var envCrit = Math.exp(-omega0 * t);
    return 1 - envCrit * (1 + omega0 * t);
  }

  function secondOrderStep(state, target, dt, freqHz, zeta, r) {
    var f = freqHz === undefined ? 2.4 : Math.max(0.05, freqHz);
    var z = zeta === undefined ? 0.72 : Math.max(0.05, zeta);
    var resp = r === undefined ? 0 : r;
    var stepDt = clamp(dt || 1 / 60, 1 / 240, 0.1);

    var s = state || { x: target, v: 0, prevTarget: target };
    if (s.x === undefined) s.x = target;
    if (s.v === undefined) s.v = 0;
    if (s.prevTarget === undefined) s.prevTarget = target;

    var w = TAU * f;
    var k1 = z / (Math.PI * f);
    var k2 = 1 / (w * w);
    var k3 = (resp * z) / w;

    // Pole-zero stability clamp keeps large frame deltas from oscillating to infinity.
    var k2Stable = Math.max(k2, (stepDt * stepDt) / 2 + (stepDt * k1) / 2, stepDt * k1);
    var targetVel = (target - s.prevTarget) / stepDt;
    s.prevTarget = target;

    s.x = s.x + stepDt * s.v;
    s.v = s.v + (stepDt * (target + k3 * targetVel - s.x - k1 * s.v)) / k2Stable;
    return s;
  }

  function sampleBezierCoord(a1, a2, u) {
    return ((1 - 3 * a2 + 3 * a1) * u + (3 * a2 - 6 * a1)) * u * u + 3 * a1 * u;
  }

  function sampleBezierSlope(a1, a2, u) {
    return 3 * (1 - 3 * a2 + 3 * a1) * u * u + 2 * (3 * a2 - 6 * a1) * u + 3 * a1;
  }

  function cubicBezier(x1, y1, x2, y2) {
    var cx1 = clamp(x1, 0, 1);
    var cx2 = clamp(x2, 0, 1);

    return function evaluateBezier(t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      if (cx1 === y1 && cx2 === y2) return t;

      var u = t;
      for (var i = 0; i < 6; i++) {
        var err = sampleBezierCoord(cx1, cx2, u) - t;
        if (Math.abs(err) < 1e-6) break;
        var slope = sampleBezierSlope(cx1, cx2, u);
        if (Math.abs(slope) < 1e-6) break;
        u = clamp(u - err / slope, 0, 1);
      }

      var lo = 0;
      var hi = 1;
      var curErr = sampleBezierCoord(cx1, cx2, u) - t;
      if (Math.abs(curErr) > 1e-5) {
        u = t;
        for (var j = 0; j < 14; j++) {
          var xVal = sampleBezierCoord(cx1, cx2, u);
          if (Math.abs(xVal - t) < 1e-6) break;
          if (xVal < t) lo = u;
          else hi = u;
          u = 0.5 * (lo + hi);
        }
      }

      return sampleBezierCoord(y1, y2, u);
    };
  }

  function easeOutExpo(t) {
    var u = clamp(t, 0, 1);
    return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u);
  }

  function easeInOutQuart(t) {
    var u = clamp(t, 0, 1);
    return u < 0.5 ? 8 * u * u * u * u : 1 - Math.pow(-2 * u + 2, 4) / 2;
  }

  var mechanicalSnap = cubicBezier(0.18, 1, 0.3, 1);

  var easings = {
    linear: function (t) { return clamp(t, 0, 1); },
    easeOutExpo: easeOutExpo,
    easeInOutQuart: easeInOutQuart,
    mechanicalSnap: mechanicalSnap
  };

  function hermiteScalar(p0, p1, p2, p3, t) {
    var t2 = t * t;
    var t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  function hermite(p0, p1, p2, p3, t) {
    var u = clamp(t, 0, 1);
    if (Array.isArray(p1)) {
      return [
        hermiteScalar(p0[0], p1[0], p2[0], p3[0], u),
        hermiteScalar(p0[1], p1[1], p2[1], p3[1], u)
      ];
    }
    if (p1 && typeof p1 === 'object') {
      return {
        x: hermiteScalar(p0.x, p1.x, p2.x, p3.x, u),
        y: hermiteScalar(p0.y, p1.y, p2.y, p3.y, u)
      };
    }
    return hermiteScalar(p0, p1, p2, p3, u);
  }

  function pointX(pt) {
    return Array.isArray(pt) ? pt[0] : pt.x;
  }

  function pointY(pt) {
    return Array.isArray(pt) ? pt[1] : pt.y;
  }

  function samplePath(points, t) {
    if (!points || points.length === 0) {
      return { x: 0, y: 0, tx: 1, ty: 0, angle: 0, length: 0 };
    }
    if (points.length === 1) {
      return { x: pointX(points[0]), y: pointY(points[0]), tx: 1, ty: 0, angle: 0, length: 0 };
    }

    var u = clamp(t, 0, 1);
    var n = points.length;
    var cum = [0];
    var totalLen = 0;

    for (var i = 1; i < n; i++) {
      var dx = pointX(points[i]) - pointX(points[i - 1]);
      var dy = pointY(points[i]) - pointY(points[i - 1]);
      totalLen += Math.hypot(dx, dy);
      cum.push(totalLen);
    }

    if (totalLen < 1e-6) {
      return { x: pointX(points[0]), y: pointY(points[0]), tx: 1, ty: 0, angle: 0, length: 0 };
    }

    var targetDist = u * totalLen;
    var seg = 0;
    while (seg < n - 2 && cum[seg + 1] < targetDist) {
      seg++;
    }

    var segLen = Math.max(1e-6, cum[seg + 1] - cum[seg]);
    var localT = clamp((targetDist - cum[seg]) / segLen, 0, 1);

    var x;
    var y;
    var tx;
    var ty;

    if (n === 2) {
      var x0 = pointX(points[0]);
      var y0 = pointY(points[0]);
      var x1 = pointX(points[1]);
      var y1 = pointY(points[1]);
      x = mix(x0, x1, localT);
      y = mix(y0, y1, localT);
      tx = x1 - x0;
      ty = y1 - y0;
    } else {
      var p0 = points[Math.max(0, seg - 1)];
      var p1 = points[seg];
      var p2 = points[seg + 1];
      var p3 = points[Math.min(n - 1, seg + 2)];
      x = hermiteScalar(pointX(p0), pointX(p1), pointX(p2), pointX(p3), localT);
      y = hermiteScalar(pointY(p0), pointY(p1), pointY(p2), pointY(p3), localT);

      var eps = 0.01;
      var tA = clamp(localT - eps, 0, 1);
      var tB = clamp(localT + eps, 0, 1);
      var xA = hermiteScalar(pointX(p0), pointX(p1), pointX(p2), pointX(p3), tA);
      var yA = hermiteScalar(pointY(p0), pointY(p1), pointY(p2), pointY(p3), tA);
      var xB = hermiteScalar(pointX(p0), pointX(p1), pointX(p2), pointX(p3), tB);
      var yB = hermiteScalar(pointY(p0), pointY(p1), pointY(p2), pointY(p3), tB);
      tx = xB - xA;
      ty = yB - yA;
    }

    var mag = Math.hypot(tx, ty) || 1;
    tx /= mag;
    ty /= mag;

    return {
      x: x,
      y: y,
      tx: tx,
      ty: ty,
      angle: Math.atan2(ty, tx),
      length: totalLen
    };
  }

  function waveMode(x, y, t, freq, amp) {
    var f = freq === undefined ? 1 : freq;
    var a = amp === undefined ? 1 : amp;
    var k = TAU * f;
    var m1 = Math.sin(x * k + t) * Math.cos(y * k * 0.75 - t * 0.65);
    var m2 = Math.cos((x - y) * k * 0.6 + t * 0.85) * 0.5;
    return a * ((m1 + m2) / 1.5);
  }

  function streamPotential(x, y, t) {
    return (
      Math.sin(x * 1.9 + t * 0.6) * Math.cos(y * 1.7 - t * 0.45) +
      0.5 * Math.sin((x + y) * 2.6 - t * 0.8) +
      0.35 * Math.cos((x * 1.3 - y * 2.1) + t * 0.5)
    );
  }

  function curlField(x, y, t) {
    var eps = 0.01;
    var dPsiDy = (streamPotential(x, y + eps, t) - streamPotential(x, y - eps, t)) / (2 * eps);
    var dPsiDx = (streamPotential(x + eps, y, t) - streamPotential(x - eps, y, t)) / (2 * eps);
    return { vx: dPsiDy, vy: -dPsiDx };
  }

  function superformulaRadius(theta, m, n1, n2, n3, a, b) {
    var sym = m === undefined ? 6 : m;
    var p1 = n1 === undefined || Math.abs(n1) < 1e-4 ? 1 : n1;
    var p2 = n2 === undefined ? 1 : n2;
    var p3 = n3 === undefined ? 1 : n3;
    var sa = a === undefined || Math.abs(a) < 1e-4 ? 1 : a;
    var sb = b === undefined || Math.abs(b) < 1e-4 ? 1 : b;

    var angle = (sym * theta) * 0.25;
    var term1 = Math.pow(Math.abs(Math.cos(angle) / sa), p2);
    var term2 = Math.pow(Math.abs(Math.sin(angle) / sb), p3);
    var sum = term1 + term2;
    if (sum < 1e-9 || !isFinite(sum)) return 0;
    var radius = Math.pow(sum, -1 / p1);
    return isFinite(radius) ? radius : 0;
  }

  function isJapaneseCodePoint(code) {
    return (
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xff00 && code <= 0xffef)
    );
  }

  function scrambleText(targetText, progress, seed) {
    var text = String(targetText || '');
    var p = clamp(progress === undefined ? 1 : progress, 0, 1);
    if (p >= 1 || text.length === 0) return text;

    var baseSeed = toSeedUint32(seed === undefined ? text.length * 131 : seed);
    var len = text.length;
    var outChars = new Array(len);

    for (var i = 0; i < len; i++) {
      var ch = text.charAt(i);
      if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '　') {
        outChars[i] = ch;
        continue;
      }
      var threshold = (i + 0.35) / len;
      if (p >= threshold) {
        outChars[i] = ch;
      } else {
        var r = hash((baseSeed + i * 7919 + Math.floor(p * 24) * 104729) >>> 0);
        var pool = isJapaneseCodePoint(text.charCodeAt(i)) ? JP_GLYPHS : ASCII_GLYPHS;
        outChars[i] = pool.charAt(Math.floor(r * pool.length) % pool.length);
      }
    }
    return outChars.join('');
  }

  function safeMacroEnvStep(prevValue, rawEnvelope, bpm, lastDelta) {
    var raw = clamp(Number(rawEnvelope) || 0, 0, 1);
    var prev = clamp(Number(prevValue) || 0, 0, 1);
    var dt = typeof lastDelta === 'number' && isFinite(lastDelta)
      ? (lastDelta > 1 ? lastDelta / 1000 : lastDelta)
      : 1 / 60;
    dt = clamp(dt, 1 / 240, 0.1);

    // Effective macro cutoff stays strictly <= 1.6 Hz regardless of track BPM (WCAG 2.3.1 safety).
    var beatHz = bpm && isFinite(bpm) ? bpm / 60 : 2.0;
    var maxHz = Math.min(WCAG_MAX_HZ, beatHz > WCAG_MAX_HZ ? 1.35 : Math.max(0.6, beatHz));
    var alpha = 1 - Math.exp(-TAU * maxHz * dt);
    var filtered = prev + (raw - prev) * alpha;
    var delta = clamp(filtered - prev, -WCAG_MAX_FRAME_DELTA, WCAG_MAX_FRAME_DELTA);
    return clamp(prev + delta, 0, 1);
  }

  var MotionAtlas = {
    TAU: TAU,
    clamp: clamp,
    mix: mix,
    phase: phase,
    smooth: smooth,
    out: out,
    hash: hash,
    seedRandom: seedRandom,
    spring: spring,
    secondOrderStep: secondOrderStep,
    cubicBezier: cubicBezier,
    easings: easings,
    hermite: hermite,
    samplePath: samplePath,
    waveMode: waveMode,
    curlField: curlField,
    superformulaRadius: superformulaRadius,
    scrambleText: scrambleText,
    safeMacroEnv: function (rawEnvelope, bpm, lastDelta, prevValue) {
      return safeMacroEnvStep(prevValue === undefined ? 0 : prevValue, rawEnvelope, bpm, lastDelta);
    },
    WCAG_MAX_HZ: WCAG_MAX_HZ,
    WCAG_MAX_FRAME_DELTA: WCAG_MAX_FRAME_DELTA,
    BURST_COOLDOWN_MS: BURST_COOLDOWN_MS
  };

  function nowMs() {
    if (global.performance && typeof global.performance.now === 'function') {
      return global.performance.now();
    }
    return Date.now();
  }

  function isElementInViewport(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return true;
    var rect = el.getBoundingClientRect();
    var vw = global.innerWidth || 1440;
    var vh = global.innerHeight || 900;
    return rect.width >= 0 && rect.height >= 0 &&
      rect.bottom >= -80 && rect.top <= vh + 80 &&
      rect.right >= -80 && rect.left <= vw + 80;
  }

  function MotionEngine(options) {
    if (!(this instanceof MotionEngine)) {
      return new MotionEngine(options);
    }
    var opts = options || {};

    this._surfaces = new Map();
    this._elementToIds = new Map();
    this._listeners = new Set();
    this._rafId = null;
    this._running = false;
    this._disposed = false;

    this._startTimeMs = nowMs();
    this._lastTimeMs = 0;

    this._frameWindow = [];
    this._avgFrameMs = 16.67;
    this._qualityTier = 'high';
    this._slowFrameStreak = 0;
    this._fastFrameStreak = 0;
    this._lastTierChangeMs = this._startTimeMs;

    this._macroEnvChannels = Object.create(null);
    this._lastBurstMs = Object.create(null);

    this._hidden = typeof global.document !== 'undefined' ? Boolean(global.document.hidden) : false;
    this._userOverride = typeof opts.motionEnabled === 'boolean';
    this._reducedMotionQuery = null;

    var prefersReduce = false;
    if (typeof global.matchMedia === 'function') {
      try {
        this._reducedMotionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
        prefersReduce = Boolean(this._reducedMotionQuery && this._reducedMotionQuery.matches);
      } catch (_err) {
        this._reducedMotionQuery = null;
      }
    }

    this._motionEnabled = this._userOverride ? opts.motionEnabled : !prefersReduce;
    this._syncDocumentMotionAttr();

    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    this._onReducedMotionChange = this._handleReducedMotionChange.bind(this);
    this._onTick = this._tick.bind(this);

    if (typeof global.document !== 'undefined' && typeof global.document.addEventListener === 'function') {
      global.document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    if (this._reducedMotionQuery) {
      if (typeof this._reducedMotionQuery.addEventListener === 'function') {
        this._reducedMotionQuery.addEventListener('change', this._onReducedMotionChange);
      } else if (typeof this._reducedMotionQuery.addListener === 'function') {
        this._reducedMotionQuery.addListener(this._onReducedMotionChange);
      }
    }

    this._io = null;
    if (typeof global.IntersectionObserver === 'function') {
      var self = this;
      this._io = new global.IntersectionObserver(function (entries) {
        self._handleIntersection(entries);
      }, {
        root: null,
        rootMargin: '80px 0px',
        threshold: 0.01
      });
    }
  }

  MotionEngine.prototype._syncDocumentMotionAttr = function () {
    if (typeof global.document !== 'undefined' && global.document.documentElement) {
      global.document.documentElement.dataset.motion = this._motionEnabled ? 'on' : 'off';
    }
  };

  MotionEngine.prototype.getDpr = function () {
    return Math.min(global.devicePixelRatio || 1, DEFAULT_MAX_DPR);
  };

  MotionEngine.prototype.isMotionEnabled = function () {
    return this._motionEnabled;
  };

  MotionEngine.prototype.setMotionEnabled = function (bool) {
    if (this._disposed) return;
    var next = Boolean(bool);
    this._userOverride = true;
    var changed = next !== this._motionEnabled;
    this._motionEnabled = next;
    this._syncDocumentMotionAttr();

    if (!next) {
      this._stopLoop();
      this.triggerStaticRender();
    } else {
      this._ensureLoopState();
    }

    if (changed) {
      this._listeners.forEach(function (fn) {
        try { fn(next); } catch (_e) {}
      });
    }
  };

  MotionEngine.prototype.onMotionChange = function (fn) {
    if (typeof fn !== 'function') return function () {};
    this._listeners.add(fn);
    var self = this;
    return function unsubscribe() {
      self._listeners.delete(fn);
    };
  };

  MotionEngine.prototype.safeMacroEnv = function (rawEnvelope, bpm, lastDelta, channelKey) {
    var key = channelKey || 'default';
    var prev = this._macroEnvChannels[key] !== undefined ? this._macroEnvChannels[key] : 0;
    var next = safeMacroEnvStep(prev, rawEnvelope, bpm, lastDelta);
    this._macroEnvChannels[key] = next;
    return next;
  };

  MotionEngine.prototype.canTriggerBurst = function (timeMs, channelKey) {
    var key = channelKey || 'default';
    var t = typeof timeMs === 'number' && isFinite(timeMs) ? timeMs : nowMs();
    var prev = this._lastBurstMs[key];
    if (prev === undefined) return true;
    return (t - prev) >= BURST_COOLDOWN_MS;
  };

  MotionEngine.prototype.consumeBurst = function (timeMs, channelKey) {
    var key = channelKey || 'default';
    var t = typeof timeMs === 'number' && isFinite(timeMs) ? timeMs : nowMs();
    if (!this.canTriggerBurst(t, key)) return false;
    this._lastBurstMs[key] = t;
    return true;
  };

  MotionEngine.prototype.registerSurface = function (id, spec) {
    if (this._disposed || !id || !spec) return;
    if (this._surfaces.has(id)) {
      this.unregisterSurface(id);
    }

    var el = spec.element || null;
    var visible = el ? isElementInViewport(el) : true;
    var record = {
      id: id,
      element: el,
      onFrame: typeof spec.onFrame === 'function' ? spec.onFrame : null,
      onStatic: typeof spec.onStatic === 'function' ? spec.onStatic : null,
      priority: typeof spec.priority === 'number' ? spec.priority : 0,
      visible: visible
    };

    this._surfaces.set(id, record);

    if (el) {
      var idSet = this._elementToIds.get(el);
      if (!idSet) {
        idSet = new Set();
        this._elementToIds.set(el, idSet);
        if (this._io) {
          try { this._io.observe(el); } catch (_e) {}
        }
      }
      idSet.add(id);
    }

    if (!this._motionEnabled) {
      this.triggerStaticRender(id);
    } else {
      this._ensureLoopState();
    }
  };

  MotionEngine.prototype.unregisterSurface = function (id) {
    var record = this._surfaces.get(id);
    if (!record) return;
    this._surfaces.delete(id);

    if (record.element) {
      var idSet = this._elementToIds.get(record.element);
      if (idSet) {
        idSet.delete(id);
        if (idSet.size === 0) {
          this._elementToIds.delete(record.element);
          if (this._io) {
            try { this._io.unobserve(record.element); } catch (_e) {}
          }
        }
      }
    }

    this._ensureLoopState();
  };

  MotionEngine.prototype._getOrderedSurfaces = function () {
    var arr = [];
    this._surfaces.forEach(function (rec) { arr.push(rec); });
    arr.sort(function (a, b) { return b.priority - a.priority; });
    return arr;
  };

  MotionEngine.prototype.triggerStaticRender = function (id) {
    if (this._disposed) return;
    var now = nowMs();
    var ctx = {
      now: now,
      elapsed: (now - this._startTimeMs) / 1000,
      dt: 0,
      dpr: this.getDpr(),
      qualityTier: this._qualityTier,
      motionEnabled: this._motionEnabled,
      engine: this
    };

    if (id !== undefined && id !== null) {
      var one = this._surfaces.get(id);
      if (one && one.onStatic) {
        one.onStatic(ctx);
      }
      return;
    }

    var ordered = this._getOrderedSurfaces();
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].onStatic) {
        ordered[i].onStatic(ctx);
      }
    }
  };

  MotionEngine.prototype._hasVisibleAnimatedSurfaces = function () {
    var found = false;
    this._surfaces.forEach(function (rec) {
      if (rec.visible && rec.onFrame) found = true;
    });
    return found;
  };

  MotionEngine.prototype._ensureLoopState = function () {
    if (this._disposed || this._hidden || !this._motionEnabled || !this._hasVisibleAnimatedSurfaces()) {
      this._stopLoop();
      return;
    }
    if (!this._running && typeof global.requestAnimationFrame === 'function') {
      this._running = true;
      this._lastTimeMs = 0;
      this._rafId = global.requestAnimationFrame(this._onTick);
    }
  };

  MotionEngine.prototype._stopLoop = function () {
    if (this._rafId !== null && typeof global.cancelAnimationFrame === 'function') {
      global.cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    this._running = false;
    this._lastTimeMs = 0;
  };

  MotionEngine.prototype._updateQualityGovernor = function (frameMs, now) {
    // Ignore tab-resume stalls (> 1000 ms), while clamping severe slow frames (< 8 FPS) so governor downshifts cleanly.
    if (frameMs <= 0 || frameMs > 1000) return;
    var sampleMs = Math.min(frameMs, 250);

    this._frameWindow.push(sampleMs);
    if (this._frameWindow.length > 24) {
      this._frameWindow.shift();
    }

    var sum = 0;
    for (var i = 0; i < this._frameWindow.length; i++) {
      sum += this._frameWindow[i];
    }
    this._avgFrameMs = sum / this._frameWindow.length;

    if (sampleMs > 24) {
      this._slowFrameStreak++;
      this._fastFrameStreak = 0;
    } else if (sampleMs < 17) {
      this._fastFrameStreak++;
      this._slowFrameStreak = 0;
    } else {
      this._slowFrameStreak = Math.max(0, this._slowFrameStreak - 1);
      this._fastFrameStreak = 0;
    }

    var cooldownOk = (now - this._lastTierChangeMs) >= 1500;
    if (!cooldownOk) return;

    if ((this._avgFrameMs > 24 && this._frameWindow.length >= 12) || this._slowFrameStreak >= 10) {
      if (this._qualityTier === 'high') {
        this._qualityTier = 'medium';
        this._lastTierChangeMs = now;
        this._slowFrameStreak = 0;
      } else if (this._qualityTier === 'medium') {
        this._qualityTier = 'low';
        this._lastTierChangeMs = now;
        this._slowFrameStreak = 0;
      }
    } else if (this._avgFrameMs < 17 && this._fastFrameStreak >= 45) {
      if (this._qualityTier === 'low') {
        this._qualityTier = 'medium';
        this._lastTierChangeMs = now;
        this._fastFrameStreak = 0;
      } else if (this._qualityTier === 'medium') {
        this._qualityTier = 'high';
        this._lastTierChangeMs = now;
        this._fastFrameStreak = 0;
      }
    }
  };

  MotionEngine.prototype._tick = function (timestamp) {
    this._rafId = null;
    if (this._disposed || this._hidden || !this._motionEnabled) {
      this._running = false;
      return;
    }

    var now = typeof timestamp === 'number' && isFinite(timestamp) ? timestamp : nowMs();
    var rawFrameMs = this._lastTimeMs ? (now - this._lastTimeMs) : 16.67;
    this._lastTimeMs = now;
    this._updateQualityGovernor(rawFrameMs, now);

    var dt = clamp(rawFrameMs / 1000, 1 / 240, 0.05);
    var ctx = {
      now: now,
      elapsed: (now - this._startTimeMs) / 1000,
      dt: dt,
      dpr: this.getDpr(),
      qualityTier: this._qualityTier,
      motionEnabled: this._motionEnabled,
      engine: this
    };

    var ordered = this._getOrderedSurfaces();
    var anyVisible = false;
    for (var i = 0; i < ordered.length; i++) {
      var surface = ordered[i];
      if (!surface.visible) continue;
      if (surface.onFrame) {
        anyVisible = true;
        surface.onFrame(ctx);
      }
    }

    if (anyVisible && !this._disposed && !this._hidden && this._motionEnabled) {
      this._rafId = global.requestAnimationFrame(this._onTick);
    } else {
      this._running = false;
    }
  };

  MotionEngine.prototype._handleVisibilityChange = function () {
    this._hidden = typeof global.document !== 'undefined' ? Boolean(global.document.hidden) : false;
    if (this._hidden) {
      this._stopLoop();
    } else {
      this._ensureLoopState();
    }
  };

  MotionEngine.prototype._handleReducedMotionChange = function (evt) {
    if (this._userOverride) return;
    var reduced = Boolean(evt && evt.matches);
    this._motionEnabled = !reduced;
    this._syncDocumentMotionAttr();
    if (!this._motionEnabled) {
      this._stopLoop();
      this.triggerStaticRender();
    } else {
      this._ensureLoopState();
    }
    var enabled = this._motionEnabled;
    this._listeners.forEach(function (fn) {
      try { fn(enabled); } catch (_e) {}
    });
  };

  MotionEngine.prototype._handleIntersection = function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var idSet = this._elementToIds.get(entry.target);
      if (!idSet) continue;
      var isVis = Boolean(entry.isIntersecting && entry.intersectionRatio > 0);
      var self = this;
      idSet.forEach(function (id) {
        var rec = self._surfaces.get(id);
        if (!rec) return;
        var prevVis = rec.visible;
        rec.visible = isVis;
        if (isVis && !prevVis && !self._motionEnabled && rec.onStatic) {
          self.triggerStaticRender(id);
        }
      });
    }
    this._ensureLoopState();
  };

  MotionEngine.prototype.getDiagnostics = function () {
    var visibleSurfaces = [];
    this._surfaces.forEach(function (rec, id) {
      if (rec.visible) visibleSurfaces.push(id);
    });
    return {
      running: this._running,
      motionEnabled: this._motionEnabled,
      hidden: this._hidden,
      qualityTier: this._qualityTier,
      avgFrameMs: Math.round(this._avgFrameMs * 100) / 100,
      dpr: this.getDpr(),
      surfaceCount: this._surfaces.size,
      visibleSurfaces: visibleSurfaces
    };
  };

  MotionEngine.prototype.dispose = function () {
    if (this._disposed) return;
    this._disposed = true;
    this._stopLoop();

    if (this._io) {
      try { this._io.disconnect(); } catch (_e) {}
      this._io = null;
    }

    if (typeof global.document !== 'undefined' && typeof global.document.removeEventListener === 'function') {
      global.document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }

    if (this._reducedMotionQuery) {
      if (typeof this._reducedMotionQuery.removeEventListener === 'function') {
        this._reducedMotionQuery.removeEventListener('change', this._onReducedMotionChange);
      } else if (typeof this._reducedMotionQuery.removeListener === 'function') {
        this._reducedMotionQuery.removeListener(this._onReducedMotionChange);
      }
      this._reducedMotionQuery = null;
    }

    this._surfaces.clear();
    this._elementToIds.clear();
    this._listeners.clear();
  };

  // Singleton forwarding on the constructor lets callers use either `new MotionEngine()` or `MotionEngine.registerSurface(...)`.
  var defaultEngine = null;
  function getSharedEngine() {
    if (!defaultEngine || defaultEngine._disposed) {
      defaultEngine = new MotionEngine();
    }
    return defaultEngine;
  }

  MotionEngine.getShared = getSharedEngine;
  MotionEngine.create = function (opts) { return new MotionEngine(opts); };

  [
    'registerSurface',
    'unregisterSurface',
    'setMotionEnabled',
    'isMotionEnabled',
    'triggerStaticRender',
    'getDiagnostics',
    'safeMacroEnv',
    'canTriggerBurst',
    'consumeBurst',
    'onMotionChange',
    'getDpr',
    'dispose'
  ].forEach(function (methodName) {
    MotionEngine[methodName] = function () {
      var inst = getSharedEngine();
      return inst[methodName].apply(inst, arguments);
    };
  });

  ns.MotionAtlas = MotionAtlas;
  ns.MotionEngine = MotionEngine;
})(window);
