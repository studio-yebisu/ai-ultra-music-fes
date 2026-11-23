(function (global) {
  'use strict';

  const ns = global.AIUMF = global.AIUMF || {};
  const FFT_SIZE = 4096;
  const FADE = 0.25;
  const EDGE = 0.008;
  const clamp = (x, min, max) => Math.min(max, Math.max(min, Number(x) || 0));
  const bpm = stage => stage.measuredBpm || stage.promptBpm || 120;
  const cue = stage => stage.cueSec ?? stage.firstDownbeatSec ?? 0;

  function beatNumber(stage, time) {
    const beats = stage.beatTimesSec;
    const period = 60 / bpm(stage);
    if (!beats || !beats.length) return (time - (stage.firstDownbeatSec || 0)) / period;
    let lo = 0;
    let hi = beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (beats[mid] <= time) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(0, lo - 1);
    return i + (time - beats[i]) / ((beats[i + 1] - beats[i]) || period);
  }

  function beatWait(stage, position) {
    const beats = stage.beatTimesSec || [];
    const n = beatNumber(stage, position);
    const i = Math.floor(n);
    const period = (beats[i + 1] - beats[i]) || 60 / bpm(stage);
    let wait = (1 - (n - i)) * period;
    if (wait < 0.05) wait += period;
    return clamp(wait, 0.05, Math.max(0.65, period));
  }

  function gainNode(ctx, value) {
    const node = ctx.createGain();
    node.gain.value = value;
    return node;
  }

  function target(param, value, now) {
    param.setTargetAtTime(value, now, 0.025);
  }

  // Short linear segments allow an equal-power fade to be interrupted mid-curve.
  function fade(voice, start, duration, from, to) {
    const param = voice.gain.gain;
    param.cancelScheduledValues(start);
    param.setValueAtTime(from, start);
    const steps = duration > EDGE ? 32 : 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const shape = to > from ? Math.sin(t * Math.PI / 2) : 1 - Math.cos(t * Math.PI / 2);
      param.linearRampToValueAtTime(from + (to - from) * shape, start + duration * t);
    }
  }

  async function readBuffer(ctx, id, path) {
    const inline = global.document.getElementById(id);
    let bytes;
    if (inline && inline.textContent.trim()) {
      const chars = global.atob(inline.textContent.trim());
      const data = new Uint8Array(chars.length);
      for (let i = 0; i < chars.length; i++) data[i] = chars.charCodeAt(i);
      bytes = data.buffer;
    } else {
      const response = await global.fetch(ns.resolveAsset(path));
      if (!response.ok) throw new Error('Cannot load ' + path + ' (HTTP ' + response.status + ')');
      bytes = await response.arrayBuffer();
    }
    return ctx.decodeAudioData(bytes);
  }

  function bandLevel(fft, begin, end) {
    let sum = 0;
    for (let i = begin; i < end; i++) sum += fft[i];
    return sum / (255 * Math.max(1, end - begin));
  }

  class FestivalAudioEngine {
    constructor(data) {
      this.stages = new Map(data.stages.map(stage => [stage.id, stage]));
      this.effects = new Map(data.sfx.map(effect => [effect.id, effect]));
      this.stage = data.stages[0];
      this.position = cue(this.stage);
      this.state = 'idle';
      this.activeDeck = 'A';
      this.ctx = null;
      this.voice = null;
      this.voices = new Set();
      this.sfxVoices = new Map();
      this.tracks = new Map();
      this.sounds = new Map();
      this.loads = new Map();
      this.pending = null;
      this.loadingStage = null;
      this.switchToken = 0;
      this.closed = false;
      this.loopEnabled = false;
      this.sfxEnabled = true;
      this.filterValue = 0;
      this.delaySend = 0;
      this.masterGain = 0.80;
      this.frame = {
        playing: false, energy: 0, bass: 0, mid: 0, high: 0,
        beatPhase: 0, barPhase: 0, beatIndex: 0, onBeatPulse: 0,
        waveBytes: new Uint8Array(FFT_SIZE).fill(128), fftBytes: new Uint8Array(FFT_SIZE / 2)
      };
      this.wave = new Float32Array(FFT_SIZE);
    }

    _connect(ctx) {
      this.master = gainNode(ctx, this.masterGain);
      this.master.connect(ctx.destination);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.12;
      const headroom = gainNode(ctx, 0.5);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.65;
      this.analyser.connect(headroom);
      headroom.connect(compressor);
      compressor.connect(this.master);
      this.filter = ctx.createBiquadFilter();
      this.filter.Q.value = 0.707;
      this.filter.frequency.value = Math.min(22000, ctx.sampleRate / 2);
      this.setFilter(this.filterValue);
      this.filter.connect(this.analyser);
      this.delay = ctx.createDelay(4);
      this.delay.delayTime.value = 0.75 * 60 / bpm(this.stage);
      this.wet = gainNode(ctx, this.delaySend);
      const feedback = gainNode(ctx, 0.32);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 3200;
      this.filter.connect(this.wet);
      this.wet.connect(this.delay);
      this.delay.connect(this.analyser);
      this.delay.connect(tone);
      tone.connect(feedback);
      feedback.connect(this.delay);
      this.sfxBus = gainNode(ctx, this.sfxEnabled ? Math.pow(10, -3 / 20) : 0);
      this.sfxBus.connect(this.master);
      this.bins = [20, 250, 2500, 12000].map(hz =>
        Math.min(FFT_SIZE / 2, Math.ceil(hz * FFT_SIZE / ctx.sampleRate)));
    }

    async unlock() {
      if (this.closed) throw new Error('Audio engine disposed');
      if (!this.ctx) {
        const Context = global.AudioContext || global.webkitAudioContext;
        if (!Context) throw new Error('Web Audio unavailable');
        this.ctx = new Context();
        this._connect(this.ctx);
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running') await ctx.resume();
      if (this.closed) throw new Error('Audio engine disposed');
      for (const effect of this.effects.values()) {
        if (!this.sounds.has(effect.id) && !this.loads.has('audio-sfx-' + effect.id)) {
          this._load(effect, true).catch(() => {}); // Optional cues retry on the next unlock.
        }
      }
      return { unlocked: true, sampleRate: ctx.sampleRate };
    }

    _load(item, sfx) {
      const cache = sfx ? this.sounds : this.tracks;
      if (cache.has(item.id)) return cache.get(item.id);
      const id = (sfx ? 'audio-sfx-' : 'audio-track-') + item.id;
      if (!this.loads.has(id)) {
        const promise = readBuffer(this.ctx, id, sfx ? item.file : item.audioPath)
          .then(buffer => {
            if (!this.closed) cache.set(item.id, buffer);
            return buffer;
          }).finally(() => this.loads.delete(id));
        this.loads.set(id, promise);
      }
      return this.loads.get(id);
    }

    _duration() {
      return this.tracks.get(this.stage.id)?.duration ?? this.stage.durationSec;
    }

    _position() {
      const v = this.voice;
      if (!v) return this.position;
      const source = v.source;
      const t = v.offset + Math.max(0, this.ctx.currentTime - v.start);
      if (source.loop && t >= source.loopEnd) {
        return source.loopStart + (t - source.loopStart) % (source.loopEnd - source.loopStart);
      }
      return Math.min(t, source.buffer.duration);
    }

    _newVoice(stage, offset, start, deck) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.tracks.get(stage.id);
      source.loopStart = clamp(stage.loopStartSec, 0, source.buffer.duration);
      source.loopEnd = clamp(stage.loopEndSec, 0, source.buffer.duration);
      source.loop = this.loopEnabled && source.loopEnd > source.loopStart;
      offset = clamp(offset, 0, source.buffer.duration);
      if (source.loop && offset >= source.loopEnd) {
        offset = source.loopStart + (offset - source.loopStart) % (source.loopEnd - source.loopStart);
      }
      const gain = gainNode(this.ctx, 0);
      source.connect(gain);
      gain.connect(this.filter);
      const v = { source, gain, start, offset, deck };
      this.voices.add(v);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(v);
        this._commitDue();
        if (this.voice === v) {
          this.voice = null;
          this.position = this._duration();
          this.state = 'paused';
        }
      };
      source.start(start, offset);
      return v;
    }

    _retire(v) {
      const now = this.ctx.currentTime;
      fade(v, now, EDGE, v.gain.gain.value, 0);
      v.source.stop(now + EDGE);
    }

    _select(stage, position) {
      this.stage = stage;
      this.position = position;
      if (this.delay) target(this.delay.delayTime, 0.75 * 60 / bpm(stage), this.ctx.currentTime);
    }

    _commitDue() {
      const p = this.pending;
      if (!p || p.token !== this.switchToken || this.ctx.currentTime < p.start) return;
      this.pending = null;
      this.loadingStage = null;
      global.clearTimeout(p.timer);
      if (this.voices.has(p.outgoing)) p.outgoing.source.stop(p.start + (p.fadeDur || FADE));
      this.voice = p.incoming;
      this.activeDeck = this.voice.deck;
      this._select(p.stage, this.voice.offset);
      this.state = 'playing';
      p.resolve();
    }

    _cancel() {
      this._commitDue();
      const token = ++this.switchToken;
      this.loadingStage = null;
      const p = this.pending;
      if (p) {
        this.pending = null;
        global.clearTimeout(p.timer);
        p.incoming.source.stop();
        p.resolve();
      }
      if (this.voice) {
        const now = this.ctx.currentTime;
        fade(this.voice, now, EDGE, this.voice.gain.gain.value, 1);
      }
      // A third selection can arrive while the previous deck is still fading out.
      for (const v of this.voices) {
        if (v !== this.voice && v !== p?.incoming) this._retire(v);
      }
      return token;
    }

    _stage(id) {
      const stage = this.stages.get(id);
      if (!stage) throw new RangeError('Unknown festival stage ' + id);
      return stage;
    }

    async play(stageId) {
      this._commitDue();
      const stage = this._stage(stageId ?? this.stage.id);
      if (this.voice) {
        if (this.ctx.state !== 'running') {
          const prior = this.switchToken;
          await this.unlock();
          if (prior !== this.switchToken) return;
        }
        return this.switchStage(stage.id);
      }
      const token = this._cancel();
      if (stage !== this.stage) this._select(stage, cue(stage));
      this.loadingStage = stage;
      this.state = 'loading';
      try {
        await this.unlock();
        if (token !== this.switchToken) return;
        const buffer = await this._load(stage, false);
        if (token !== this.switchToken) return;
        const offset = this.position >= buffer.duration ? cue(stage) : this.position;
        this.voice = this._newVoice(stage, offset, this.ctx.currentTime, this.activeDeck);
        fade(this.voice, this.voice.start, EDGE, 0, 1);
        this.state = 'playing';
      } catch (error) {
        if (token !== this.switchToken) return;
        this.state = 'paused';
        throw error;
      } finally {
        if (token === this.switchToken) this.loadingStage = null;
      }
    }

    pause() {
      this._cancel();
      this.position = this._position();
      if (this.voice) this._retire(this.voice);
      this.voice = null;
      this.state = 'paused';
    }

    async switchStage(stageId, { quantize = true } = {}) {
      const stage = this._stage(stageId);
      const token = this._cancel();
      if (!this.voice) {
        this._select(stage, stage === this.stage ? this.position : cue(stage));
        this.state = 'paused';
        return;
      }
      if (stage === this.stage) return;
      this.loadingStage = stage;
      try {
        await this._load(stage, false);
      } catch (error) {
        if (token === this.switchToken) throw error;
      } finally {
        if (token === this.switchToken) this.loadingStage = null;
      }
      if (token !== this.switchToken) return;
      if (!this.voice) return this.play(stage.id); // The outgoing track ended during decode.
      const now = this.ctx.currentTime;
      const position = this._position();
      const remaining = Math.max(0, this._duration() - position);
      let wait = quantize ? beatWait(this.stage, position) : 0;
      if (!this.voice.source.loop) wait = Math.min(wait, Math.max(0, remaining - FADE));
      const fadeDur = (!this.voice.source.loop && remaining <= EDGE)
        ? EDGE
        : (!this.voice.source.loop ? Math.min(FADE, remaining) : FADE);
      const start = now + wait;
      const deck = this.activeDeck === 'A' ? 'B' : 'A';
      const incoming = this._newVoice(stage, cue(stage), start, deck);
      fade(incoming, start, fadeDur, 0, 1);
      fade(this.voice, start, fadeDur, wait >= EDGE ? 1 : this.voice.gain.gain.value, 0);
      await new Promise(resolve => {
        const p = { incoming, outgoing: this.voice, stage, start, fadeDur, resolve, token, timer: 0 };
        this.pending = p;
        const tick = () => {
          if (this.pending !== p || token !== this.switchToken) return;
          this._commitDue();
          if (this.pending === p) {
            p.timer = global.setTimeout(tick, Math.max(8, (start - this.ctx.currentTime) * 1000));
          }
        };
        tick();
      });
    }

    seek(seconds) {
      this._commitDue();
      const targetStage = this.pending ? this.pending.stage : (this.loadingStage || this.stage);
      const wasPlaying = Boolean(this.voice) || this.state === 'loading' || Boolean(this.loadingStage);
      if (this.voice || this.pending || this.loadingStage) this._cancel();
      if (targetStage !== this.stage) this._select(targetStage, 0);
      const dur = this.tracks.get(targetStage.id)?.duration ?? targetStage.durationSec;
      this.position = clamp(seconds, 0, dur);
      if (!wasPlaying) return;
      if (this.voice) {
        this._retire(this.voice);
        this.voice = null;
      }
      if (this.tracks.has(targetStage.id)) {
        this.voice = this._newVoice(targetStage, this.position, this.ctx.currentTime, this.activeDeck);
        fade(this.voice, this.voice.start, EDGE, 0, 1);
        this.state = 'playing';
      } else {
        this.play(targetStage.id).catch(() => {});
      }
    }

    setLoop(enabled) {
      this._commitDue();
      if (this.loopEnabled === Boolean(enabled)) return;
      const position = this._position();
      this.loopEnabled = Boolean(enabled);
      if (this.voice) {
        const v = this.voice;
        v.start = this.ctx.currentTime;
        v.offset = position;
        v.source.loop = this.loopEnabled && v.source.loopEnd > v.source.loopStart;
        if (v.source.loop && position >= v.source.loopEnd) v.offset = v.source.loopStart;
      }
      if (this.pending) {
        const source = this.pending.incoming.source;
        source.loop = this.loopEnabled && source.loopEnd > source.loopStart;
      }
    }

    setFilter(x) {
      this.filterValue = clamp(x, -1, 1);
      if (!this.filter) return;
      const v = this.filterValue;
      const highpass = v >= 0.02;
      const hz = Math.abs(v) < 0.02 ? 22000 :
        highpass ? 30 * Math.pow(100, v) : 18000 * Math.pow(100, v);
      const type = highpass ? 'highpass' : 'lowpass';
      const now = this.ctx.currentTime;
      if (this.filter.type !== type) {
        this.filter.frequency.cancelScheduledValues(now);
        this.filter.frequency.setValueAtTime(highpass ? 30 : Math.min(22000, this.ctx.sampleRate / 2), now);
        this.filter.type = type;
      }
      target(this.filter.frequency, Math.min(hz, this.ctx.sampleRate / 2), now);
    }

    setDelay(send) {
      this.delaySend = clamp(send, 0, 0.28);
      if (this.wet) target(this.wet.gain, this.delaySend, this.ctx.currentTime);
    }

    setMaster(gain) {
      this.masterGain = clamp(gain, 0, 1);
      if (this.master) target(this.master.gain, this.masterGain, this.ctx.currentTime);
    }

    setSfx(enabled) {
      this.sfxEnabled = Boolean(enabled);
      if (this.sfxBus) target(this.sfxBus.gain, this.sfxEnabled ? Math.pow(10, -3 / 20) : 0, this.ctx.currentTime);
    }

    playSfx(sfxId, { rate = 1.0 } = {}) {
      const buffer = this.sounds.get(sfxId);
      if (!this.sfxEnabled || !buffer || this.ctx?.state !== 'running' || this.sfxVoices.size >= 4) return;
      if (sfxId === 'hover' && Array.from(this.sfxVoices.values()).includes(sfxId)) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clamp(rate, 0.25, 4) * (0.985 + Math.random() * 0.03);
      source.connect(this.sfxBus);
      this.sfxVoices.set(source, sfxId);
      source.onended = () => {
        source.disconnect();
        this.sfxVoices.delete(source);
      };
      source.start();
    }

    getTransport() {
      this._commitDue();
      const bufferDurations = {};
      for (const [id, buffer] of this.tracks) bufferDurations[id] = buffer.duration;
      return {
        state: this.state, playing: this.state === 'playing', unlocked: this.ctx?.state === 'running',
        stageId: this.stage.id, activeDeck: this.activeDeck, currentTimeSec: this._position(),
        durationSec: this._duration(), bpm: bpm(this.stage), key: this.stage.measuredKey,
        loopEnabled: this.loopEnabled, filterValue: this.filterValue, delaySend: this.delaySend,
        masterGain: this.masterGain, sfxEnabled: this.sfxEnabled,
        loadedTracks: Array.from(this.tracks.keys()), bufferDurations
      };
    }

    getFrame() {
      this._commitDue();
      const f = this.frame;
      if (!this.voice || this.ctx.state !== 'running') {
        if (f.playing) {
          f.playing = false;
          f.energy = f.bass = f.mid = f.high = 0;
          f.beatPhase = f.barPhase = f.beatIndex = f.onBeatPulse = 0;
          f.waveBytes.fill(128);
          f.fftBytes.fill(0);
        }
        return f;
      }
      f.playing = true;
      this.analyser.getByteFrequencyData(f.fftBytes);
      this.analyser.getFloatTimeDomainData(this.wave);
      let sum = 0;
      for (let i = 0; i < this.wave.length; i++) {
        const sample = this.wave[i];
        f.waveBytes[i] = clamp((sample + 1) * 128, 0, 255);
        sum += sample * sample;
      }
      f.energy = Math.min(1, Math.sqrt(sum / this.wave.length));
      f.bass = bandLevel(f.fftBytes, this.bins[0], this.bins[1]);
      f.mid = bandLevel(f.fftBytes, this.bins[1], this.bins[2]);
      f.high = bandLevel(f.fftBytes, this.bins[2], this.bins[3]);
      const beat = Math.max(0, beatNumber(this.stage, this._position()));
      f.beatIndex = Math.floor(beat);
      f.beatPhase = beat - f.beatIndex;
      f.barPhase = (beat % 4) / 4;
      f.onBeatPulse = Math.exp(-10 * f.beatPhase);
      return f;
    }

    async dispose() {
      if (this.closed) return;
      this.closed = true;
      this._cancel();
      this.voice = null;
      for (const v of this.voices) {
        v.source.onended = null;
        v.source.stop();
        v.source.disconnect();
        v.gain.disconnect();
      }
      for (const source of this.sfxVoices.keys()) {
        source.onended = null;
        source.stop();
        source.disconnect();
      }
      this.voices.clear();
      this.sfxVoices.clear();
      this.sounds.clear();
      this.tracks.clear();
      this.loads.clear();
      this.position = cue(this.stage);
      this.state = 'idle';
      if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    }
  }

  ns.FestivalAudioEngine = FestivalAudioEngine;
})(window);
