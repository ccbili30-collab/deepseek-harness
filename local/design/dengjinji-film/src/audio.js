/**
 * Web Audio / <audio> 预览时间轴（仅用于浏览器内预览；导出成片的音轨由 scripts/mix-audio.mjs 用 ffmpeg 离线混，
 * 不依赖实时 AudioContext，保证逐帧导出与静默环境可复现）。
 *
 * 对齐方案（实测能量曲线后确定，详见 README「音乐对齐方案与差距」）：
 *  m1 0.00 起（自然尾 44.5s 散尽）｜m2 58.80 起（drop 瞬态在素材 0.7s → 压 59.50）
 *  m3 68.00 起（70s 正好覆盖巡礼 68→138）｜m4 136.20 起（素材 1.8s 前奏 → 首音对齐 138.0）
 */
import { seg, clamp01 } from './engine.js';

export const MUSIC_PLAN = [
  { id: 'm1', src: 'assets/music/m1-open.wav', start: 0.0, fadeIn: 0.5, outStart: 44.0, outEnd: 45.5, gain: 0.9 },
  { id: 'm2', src: 'assets/music/m2-drop.wav', start: 58.8, fadeIn: 0.15, outStart: 68.0, outEnd: 72.0, gain: 1.0 },
  { id: 'm3', src: 'assets/music/m3-pilgrimage.wav', start: 68.0, fadeIn: 2.0, outStart: 136.5, outEnd: 138.0, gain: 0.95 },
  { id: 'm4', src: 'assets/music/m4-end.wav', start: 136.2, fadeIn: 1.0, outStart: 165.0, outEnd: 168.0, gain: 0.9 },
];

function trackVolume(plan, t) {
  const inR = seg(t, plan.start, plan.start + plan.fadeIn);
  const outR = 1 - seg(t, plan.outStart, plan.outEnd);
  return clamp01(plan.gain * Math.min(inR, outR));
}

export class MusicTimeline {
  constructor() {
    this.elements = new Map();
    this.playing = false;
    for (const plan of MUSIC_PLAN) {
      const a = new Audio(plan.src);
      a.preload = 'auto';
      a.volume = 0;
      this.elements.set(plan.id, a);
    }
    this.ctx = null;
  }

  /** seek：把每轨 currentTime 与音量包络摆到全局 t（不发声也行，供预览/静音核对） */
  seek(t) {
    for (const plan of MUSIC_PLAN) {
      const a = this.elements.get(plan.id);
      const v = trackVolume(plan, t);
      a.volume = v;
      if (v > 0.001) {
        const off = Math.max(0, t - plan.start);
        if (Math.abs(a.currentTime - off) > 0.25) a.currentTime = off;
        if (this.playing) a.play().catch(() => {});
      } else {
        a.pause();
      }
    }
  }

  async play() {
    this.playing = true;
    for (const plan of MUSIC_PLAN) {
      const a = this.elements.get(plan.id);
      if (trackVolume(plan, this._t ?? 0) > 0.001) await a.play().catch(() => {});
    }
  }

  pause() {
    this.playing = false;
    for (const a of this.elements.values()) a.pause();
  }

  setCurrent(t) { this._t = t; }

  // ── 极简占位合成音效（预览用；成片音轨在离线混音脚本中以 ffmpeg 重做）──
  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _tone(freq, at, dur, peak, type = 'sine', decay = true) {
    const ctx = this.ensureCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t0 = ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  _noise(at, dur, peak, filterFreq = 2000, type = 'bandpass') {
    const ctx = this.ensureCtx();
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + at);
  }

  sfx(name) {
    switch (name) {
      case 'ui-tap': this._tone(1250, 0, 0.06, 0.08, 'sine'); break;
      case 'lamp-puff': this._noise(0, 0.18, 0.12, 500, 'lowpass'); break;
      case 'return-enter': this._tone(320, 0, 0.12, 0.1, 'sine'); break;
      case 'heartbeat': this._tone(58, 0, 0.18, 0.22, 'sine'); this._tone(52, 0.16, 0.14, 0.16, 'sine'); break;
      case 'riser': {
        const ctx = this.ensureCtx();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 2.5);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 2.4);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.6);
        o.connect(g).connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 2.7);
        break;
      }
      case 'drop': this._tone(62, 0, 1.6, 0.5, 'sine'); this._noise(0, 0.5, 0.18, 900, 'lowpass'); break;
      case 'bowl-bell': this._tone(220, 0, 8, 0.25, 'sine'); this._tone(331, 0, 7, 0.12, 'sine'); this._tone(442, 0, 6, 0.07, 'sine'); break;
      case 'distant-bell': this._tone(660, 0, 4, 0.08, 'sine'); this._tone(990, 0, 3, 0.04, 'sine'); break;
      case 'metal-chime': this._tone(1567, 0, 3, 0.08, 'sine'); this._tone(2093, 0, 2.4, 0.05, 'sine'); break;
      case 'crackle': this._noise(0, 0.08, 0.25, 3500, 'highpass'); break;
      case 'paper-rustle': this._noise(0, 0.35, 0.05, 3200, 'bandpass'); break;
      case 'fire-brush': this._noise(0, 1.0, 0.04, 1400, 'bandpass'); break;
      case 'wind': this._noise(0, 1.0, 0.03, 600, 'lowpass'); break;
      case 'typing': for (let i = 0; i < 8; i++) this._noise(i * 0.28, 0.03, 0.05, 2600, 'highpass'); break;
      case 'typing-fast': for (let i = 0; i < 6; i++) this._noise(i * 0.16, 0.025, 0.05, 2800, 'highpass'); break;
      case 'sparkle': for (let i = 0; i < 12; i++) this._tone(1800 + i * 160, i * 0.55, 0.3, 0.02, 'sine'); break;
      default: break;
    }
  }
}
