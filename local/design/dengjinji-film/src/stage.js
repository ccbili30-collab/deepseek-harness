/**
 * 舞台 DOM 渲染器：所有包装层都是 seek(t) 的纯函数。
 * 色板（§5）：背景 #000000｜灯芯暖白 #F5E6C8｜灯火金 #E8B15C｜正文 #F2EDE3｜次要 #8A8378。
 * 包装层禁用产品绿 #34D399、禁用金边/纸纹/光晕贴图。
 */
import {
  clamp01, lerp, seg, ease, fadeWindow, rng,
  STAGE_W, STAGE_H, SLOT_W, SLOT_H,
} from './engine.js';
import { SCENES, FLASH_SLOTS, EMBER_WINDOWS, sceneAt } from './scenes.js';

const C = {
  bg: '#000000',
  warmWhite: '#F5E6C8',
  gold: '#E8B15C',
  text: '#F2EDE3',
  muted: '#8A8378',
  placeholder: '#16140F',
};

const FONT_STACK = '"Source Han Sans SC","Noto Sans SC","PingFang SC","Hiragino Sans GB","STHeiti Light",sans-serif';

function el(tag, cls, parent) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (parent) parent.appendChild(d);
  return d;
}

export class Stage {
  constructor(root) {
    this.root = root;
    root.style.cssText = `position:relative;width:${STAGE_W}px;height:${STAGE_H}px;background:${C.bg};overflow:hidden;font-family:${FONT_STACK};`;
    this.build();
    this.t = 0;
  }

  build() {
    // 余烬 canvas（最底层粒子）
    this.ember = el('canvas', 'ember', this.root);
    this.ember.width = STAGE_W;
    this.ember.height = STAGE_H;
    this.emberCtx = this.ember.getContext('2d');

    // 屏幕槽位（录屏容器）
    this.slotWrap = el('div', 'slot-wrap', this.root);
    this.slotWrap.style.cssText = `position:absolute;left:${(STAGE_W - SLOT_W) / 2}px;top:${(STAGE_H - SLOT_H) / 2}px;width:${SLOT_W}px;height:${SLOT_H}px;transform-origin:center center;`;
    // 极弱暖光环境
    const amb = el('div', 'slot-ambient', this.slotWrap);
    amb.style.cssText = `position:absolute;inset:-160px;background:radial-gradient(ellipse at center, rgba(232,177,92,.06), transparent 60%);pointer-events:none;`;
    // 媒体层（真实录屏 <video> 池 / 静帧 <img> 与占位矩形共用）
    this.media = el('div', 'slot-media', this.slotWrap);
    this.media.style.cssText = `position:absolute;inset:0;box-shadow:0 40px 120px rgba(0,0,0,.9);background:${C.placeholder};overflow:hidden;`;
    // 静帧（巡礼 still）
    this.still = el('img', 'slot-still', this.media);
    this.still.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none;background:#000;';
    // 视频池：按 src 复用 <video>，确定性按 currentTime 寻址（不播放）
    this.videoPool = new Map();
    this.activeKey = null;
    this.ph = el('div', 'slot-ph', this.media);
    this.ph.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:120px;text-align:center;';
    this.phId = el('div', 'ph-id', this.ph);
    this.phName = el('div', 'ph-name', this.ph);
    this.phDur = el('div', 'ph-dur', this.ph);
    this.phSub = el('div', 'ph-sub', this.ph);
    // 巡礼径向点亮（只作用于槽位蒙版）
    this.reveal = el('div', 'slot-reveal', this.media);
    this.reveal.style.cssText = `position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at center, rgba(232,177,92,.22), rgba(232,177,92,.05) 45%, transparent 70%);opacity:0;`;

    // 巡礼光痕 + 模块名
    this.traceLayer = el('div', 'trace-layer', this.root);
    this.traceLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.traceLine = el('div', 'trace-line', this.traceLayer);
    this.traceName = el('div', 'trace-name', this.traceLayer);

    // 黑场字卡
    this.card = el('div', 'black-card', this.root);
    this.card.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;`;
    this.cardText = el('div', 'card-text', this.card);

    // 呼吸灯（S00）/ 收束灯（S28 末）
    this.breath = el('div', 'breath', this.root);
    this.breath.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;';
    this.breathDot = el('div', 'breath-dot', this.breath);

    // S11 四缘暖光压入
    this.vignette = el('div', 'vignette', this.root);
    this.vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;';

    // 包装字幕
    this.subtitle = el('div', 'subtitle', this.root);
    this.subtitle.style.cssText = 'position:absolute;left:0;right:0;bottom:300px;display:flex;justify-content:center;opacity:0;';
    this.subtitleText = el('div', 'subtitle-text', this.subtitle);

    // 虚拟光标层
    this.cursorLayer = el('div', 'cursor-layer', this.root);
    this.cursorLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.cursorDot = el('div', 'cursor-dot', this.cursorLayer);
    this.cursorRipple = el('div', 'cursor-ripple', this.cursorLayer);

    // 过曝转场
    this.flash = el('div', 'flash', this.root);
    this.flash.style.cssText = `position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,#F7E9CF,#F5E6C8);opacity:0;`;

    // 落版
    this.endcard = el('div', 'endcard', this.root);
    this.endcard.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;opacity:0;';
    this.endSlogan = el('div', 'end-slogan', this.endcard);
    this.endSub = el('div', 'end-sub', this.endcard);

    this.applyStaticStyle();
  }

  applyStaticStyle() {
    const s = (sel, css) => {
      const n = this.root.querySelector(sel);
      if (n) n.style.cssText += css;
    };
    s('.ph-id', `font-size:28px;letter-spacing:.2em;color:${C.muted};font-weight:300;`);
    s('.ph-name', `font-size:52px;color:${C.text};font-weight:300;letter-spacing:.04em;line-height:1.6;max-width:2200px;`);
    s('.ph-dur', `font-size:26px;color:${C.gold};opacity:.7;letter-spacing:.12em;font-weight:300;`);
    s('.ph-sub', `font-size:30px;color:${C.muted};letter-spacing:.04em;line-height:1.9;max-width:2000px;font-weight:300;`);
    s('.card-text', `font-size:120px;font-weight:300;letter-spacing:.02em;line-height:1.8;color:${C.text};white-space:nowrap;`);
    s('.trace-line', `position:absolute;left:50%;top:1560px;width:560px;height:1px;background:${C.gold};opacity:0;transform-origin:center center;`);
    s('.trace-name', `position:absolute;left:0;right:0;top:1600px;text-align:center;font-size:30px;font-weight:300;letter-spacing:.08em;color:rgba(242,237,227,.85);opacity:0;`);
    s('.subtitle-text', `font-size:30px;font-weight:300;letter-spacing:.08em;color:rgba(242,237,227,.85);`);
    s('.end-slogan', `font-size:128px;font-weight:300;letter-spacing:.02em;color:${C.warmWhite};`);
    s('.end-sub', `font-size:26px;letter-spacing:.2em;color:${C.muted};font-weight:300;`);
    this.breathDot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${C.warmWhite};box-shadow:0 0 60px 20px rgba(232,177,92,.5);`;
    this.cursorDot.style.cssText = `position:absolute;width:24px;height:24px;border-radius:50%;background:${C.warmWhite};box-shadow:0 0 18px 6px rgba(245,230,200,.35);opacity:0;`;
    this.cursorRipple.style.cssText = `position:absolute;width:24px;height:24px;border-radius:50%;border:2px solid ${C.warmWhite};opacity:0;`;
  }

  /** 主入口：按全局 t 重建全画面（媒体帧寻址为异步，导出需 await） */
  async seek(t) {
    this.t = t;
    const sc = sceneAt(t);
    this.paintSlot(sc, t);
    this.paintTrace(sc, t);
    this.paintCard(sc, t);
    this.paintBreath(sc, t);
    this.paintVignette(sc, t);
    this.paintSubtitle(sc, t);
    this.paintCursor(sc, t);
    this.paintFlash(t);
    this.paintEndcard(sc, t);
    this.paintEmbers(t);
    await this._applyMedia(sc, t);
  }

  // ── 屏幕槽位：占位 / 真实视频 / 缓推 / 径向点亮 ──
  // 仅 type==='screen' 显示槽位；S11 vignette 是纯包装压光，不显示占位槽位文字。
  paintSlot(sc, t) {
    const showSlot = sc.type === 'screen';
    // 缩放缓推
    let scale = 1;
    if (sc.push && showSlot) {
      const p = ease['ease-out'](seg(t, sc.start, sc.start + sc.push.dur));
      scale = sc.push.reverse ? lerp(sc.push.to, 1, p) : lerp(1, sc.push.to, p);
    }
    this.slotWrap.style.transform = `scale(${scale})`;
    this.slotWrap.style.opacity = showSlot ? 1 : 0;

    if (!showSlot) return;

    // 占位文案（S12 按子拍切换）
    let name = sc.placeholder?.name ?? '';
    let sub = sc.placeholder?.sub ?? '';
    if (sc.subs) {
      const active = [...sc.subs].reverse().find((s) => t >= s.at) || sc.subs[0];
      name = active.label;
      sub = sc.placeholder.sub;
    }
    this.phId.textContent = sc.id;
    this.phName.textContent = name;
    this.phDur.textContent = `${(sc.end - sc.start).toFixed(1)}s`;
    this.phSub.textContent = sub;

    // 媒体可见性由异步 _applyMedia(sc,t) 按 sc.media 决定（帧精确 seeked 寻址）
    this._desiredMedia = sc.media || null;

    // 巡礼径向点亮 600ms ease-out，只作用于槽位
    let rev = 0;
    if (sc.reveal) {
      rev = ease.reveal(seg(t, sc.start + 0.8, sc.start + 1.4));
    }
    this.reveal.style.opacity = rev.toFixed(3);
    this.reveal.style.transform = `scale(${lerp(0.2, 1, rev)})`;
  }

  // ── 媒体池与确定性帧寻址 ──
  getVideo(src) {
    let v = this.videoPool.get(src);
    if (!v) {
      v = el('video', 'slot-video', this.media);
      v.muted = true;
      v.pause();
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;';
      this.videoPool.set(src, v);
    }
    return v;
  }

  whenSeeked(v) {
    return Promise.race([
      new Promise((res) => {
        const done = () => { v.removeEventListener('seeked', done); res(); };
        v.addEventListener('seeked', done);
      }),
      new Promise((res) => setTimeout(res, 150)),
    ]);
  }

  /** 首帧 play 触发网络缓冲与解码（暂停态设 currentTime 不会下载数据），随后立即暂停 */
  async _prime(v) {
    if (v._primed) return;
    try { await v.play(); } catch { /* 自动播放被拦也继续，muted 通常放行 */ }
    await new Promise((r) => setTimeout(r, 300));
    v.pause();
    v._primed = true;
  }

  /** 帧落盘短等：seeked 事件后给两帧合成时间 */
  _settle(v) {
    return new Promise((res) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 20)));
    });
  }

  /** 重置元素为满槽位（无裁切） */
  _resetCrop(el) {
    el.style.objectFit = 'contain';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = '100%';
    el.style.height = '100%';
  }

  /** crop={x,y,w,h} 归一化源区域：放大并偏移，使该区域铺满槽位（去掉按钮/底部说明/下部卡格） */
  _applyCrop(el, c) {
    if (!c) { this._resetCrop(el); return; }
    el.style.objectFit = 'cover';
    el.style.left = `${(-c.x / c.w) * 100}%`;
    el.style.top = `${(-c.y / c.h) * 100}%`;
    el.style.width = `${(1 / c.w) * 100}%`;
    el.style.height = `${(1 / c.h) * 100}%`;
  }

  /** 按 sc.media 显示静帧/视频并把 currentTime 精确到源时间；无 media 时槽位留黑（不画占位） */
  async _applyMedia(sc, t) {
    this.still.style.display = 'none';
    for (const v of this.videoPool.values()) { v.style.display = 'none'; this._resetCrop(v); }
    this.ph.style.display = 'none';
    if (sc.type !== 'screen' || !sc.media) {
      this.activeKey = null;
      return;
    }
    const m = sc.media;
    if (m.kind === 'still') {
      if (this.still.getAttribute('src') !== m.src) this.still.src = m.src;
      this._applyCrop(this.still, m.crop);
      this.still.style.display = 'block';
      if (!this.still.complete) await this.still.decode?.().catch(() => {});
      return;
    }
    const local = t - sc.start;
    const seg = m.segs.find((s) => local >= s.from && local < s.to) || m.segs[m.segs.length - 1];
    // 分段静帧（S12d/e/f 闪切）
    if (seg.kind === 'still') {
      if (this.still.getAttribute('src') !== seg.src) this.still.src = seg.src;
      this._applyCrop(this.still, seg.crop || m.crop);
      this.still.style.display = 'block';
      if (!this.still.complete) await this.still.decode?.().catch(() => {});
      return;
    }
    const src = seg.src || m.src;
    const p = (local - seg.from) / ((seg.to - seg.from) || 1e-6);
    const srcTime = Math.max(seg.in, Math.min(seg.out, seg.in + p * (seg.out - seg.in)));
    const v = this.getVideo(src);
    if (this.activeKey !== src) {
      if (!v._ready) {
        v.src = src;
        await new Promise((res) => {
          if (v.readyState >= 1) res();
          else v.addEventListener('loadedmetadata', res, { once: true });
        });
        v._ready = true;
        await this._prime(v);
      }
      this.activeKey = src;
    }
    this._applyCrop(v, seg.crop || m.crop);
    v.style.display = 'block';
    if (Math.abs(v.currentTime - srcTime) > 1e-3) {
      v.currentTime = srcTime;
      await this.whenSeeked(v);
    }
    await this._settle(v);
  }

  /** 导出前预热：解码全部静帧、加载全部视频元数据 */
  async warmup() {
    const jobs = [];
    for (const sc of SCENES) {
      const m = sc.media;
      if (!m) continue;
      if (m.kind === 'still') {
        const im = new Image();
        im.src = m.src;
        jobs.push(im.decode?.().catch(() => {}));
      } else {
        for (const s of m.segs) {
          if (s.kind === 'still') {
            const im = new Image();
            im.src = s.src;
            jobs.push(im.decode?.().catch(() => {}));
            continue;
          }
          const src = s.src || m.src;
          const v = this.getVideo(src);
          if (!v._ready) {
            v.src = src;
            jobs.push(Promise.race([
              new Promise((res) => {
                if (v.readyState >= 1) res();
                else v.addEventListener('loadedmetadata', res, { once: true });
              }),
              new Promise((res) => setTimeout(res, 4000)),
            ]).then(async () => {
              try { await v.play(); } catch { /* muted 放行 */ }
              await new Promise((r) => setTimeout(r, 250));
              v.pause();
              v._primed = true;
            }));
            v._ready = true;
          }
        }
      }
    }
    await Promise.all(jobs);
  }

  // ── 巡礼光痕（0.8″，1px 暖金，60px/s 量级短划）→ 浮名 ──
  paintTrace(sc, t) {
    if (!sc.trace) {
      this.traceLayer.style.opacity = 0;
      this.traceName.style.opacity = 0;
      this.traceLine.style.opacity = 0;
      return;
    }
    this.traceLayer.style.opacity = 1;
    const local = t - sc.start;
    const sweep = seg(local, 0, 0.8);
    this.traceLine.style.opacity = sweep > 0 && sweep < 1 ? 0.85 : (local > 0.5 ? 0.5 : 0);
    this.traceLine.style.transform = `translateX(-50%) scaleX(${sweep})`;
    // 4K 可读完整横划（蓝本 60px/s×0.8s 在 4K 过短，以观感为准取 560px 居中）
    this.traceLine.style.width = '560px';
    const nameP = seg(local, 0.5, 1.0);
    this.traceName.style.opacity = (0.85 * ease['ease-out-soft'](nameP)).toFixed(3);
    this.traceName.textContent = sc.pilgrimage ?? '';
  }

  // ── 黑场字卡：淡入 600ms card bezier → 停留 → 淡出 400ms，无位移 ──
  paintCard(sc, t) {
    if (sc.type !== 'black-card') {
      this.card.style.opacity = 0;
      return;
    }
    const o = fadeWindow(t, sc.start, sc.end, 0.6, 0.4);
    this.card.style.opacity = o.toFixed(3);
    this.cardText.textContent = sc.text;
  }

  // ── S00 呼吸灯：4s 周期，亮度 0.8↔1.0 ──
  paintBreath(sc, t) {
    if (sc.id !== 'S00' && sc.id !== 'S28') {
      this.breath.style.opacity = 0;
      return;
    }
    if (sc.id === 'S00') {
      const phase = (t % 4) / 4;
      const bright = 0.9 + 0.1 * Math.sin(phase * Math.PI * 2 - Math.PI / 2);
      this.breath.style.opacity = bright.toFixed(3);
      this.breathDot.style.transform = `scale(${lerp(0.9, 1.1, (bright - 0.8) / 0.2)})`;
    } else {
      // S28 末段余烬收束成一粒灯芯
      const p = seg(t, 163.5, 165);
      this.breath.style.opacity = p.toFixed(3);
      this.breathDot.style.transform = `scale(${lerp(0.4, 1, p)})`;
    }
  }

  // ── S11 四缘暖光压入（黑 → 8% 暖光，2s）──
  paintVignette(sc, t) {
    if (sc.id !== 'S11') {
      this.vignette.style.opacity = 0;
      return;
    }
    const p = ease['ease-out-soft'](seg(t, 57, 59));
    this.vignette.style.opacity = p.toFixed(3);
    this.vignette.style.background = `radial-gradient(ellipse at center, transparent 55%, rgba(232,177,92,${(0.08 * p).toFixed(3)}) 100%)`;
  }

  // ── 包装字幕（S04 / S26 / S27）──
  paintSubtitle(sc, t) {
    if (!sc.subtitle) {
      this.subtitle.style.opacity = 0;
      return;
    }
    const { text, at, dur } = sc.subtitle;
    const o = fadeWindow(t, at, at + dur, 0.4, 0.4);
    this.subtitle.style.opacity = o.toFixed(3);
    this.subtitleText.textContent = text;
  }

  // ── 虚拟光标：暖白圆点 + 点击 300ms 涟漪 ──
  paintCursor(sc, t) {
    const ev = (sc.cursor || []).find((c) => t >= c.at - 1.1 && t <= c.at + 1.2);
    if (!ev) {
      this.cursorDot.style.opacity = 0;
      this.cursorRipple.style.opacity = 0;
      return;
    }
    const x = ev.x * STAGE_W;
    const y = ev.y * STAGE_H;
    this.cursorDot.style.opacity = 0.95;
    this.cursorDot.style.left = `${x - 12}px`;
    this.cursorDot.style.top = `${y - 12}px`;
    // 点击涟漪 300ms
    const rp = seg(t, ev.at, ev.at + 0.3);
    if (ev.click && rp >= 0 && rp < 1) {
      this.cursorRipple.style.opacity = (0.8 * (1 - rp)).toFixed(3);
      const r = lerp(12, 90, ease['ease-out'](rp));
      this.cursorRipple.style.width = `${r * 2}px`;
      this.cursorRipple.style.height = `${r * 2}px`;
      this.cursorRipple.style.left = `${x - r}px`;
      this.cursorRipple.style.top = `${y - r}px`;
    } else {
      this.cursorRipple.style.opacity = 0;
    }
  }

  // ── 过曝转场：3 个槽位，暖白峰值 ≤92%，300–500ms ──
  paintFlash(t) {
    const slot = FLASH_SLOTS.find((f) => t >= f.at - f.dur && t <= f.at + f.dur);
    if (!slot) {
      this.flash.style.opacity = 0;
      return;
    }
    const half = slot.dur / 2;
    const p = t < slot.at ? seg(t, slot.at - half, slot.at) : 1 - seg(t, slot.at, slot.at + half);
    this.flash.style.opacity = (0.92 * ease.card(p)).toFixed(3);
  }

  // ── 落版 S29 ──
  paintEndcard(sc, t) {
    if (sc.type !== 'endcard') {
      this.endcard.style.opacity = 0;
      return;
    }
    const o = fadeWindow(t, sc.start, sc.end, 0.8, 0.5);
    this.endcard.style.opacity = o.toFixed(3);
    this.endSlogan.textContent = sc.text;
    this.endSub.textContent = sc.sub;
  }

  // ── 余烬 canvas：≤30 粒，0.8–2px，上飘 4–10px/s，寿命 6–10s，景深虚化，暖金 20–45% ──
  paintEmbers(t) {
    const ctx = this.emberCtx;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    const win = EMBER_WINDOWS.find((w) => t >= w.from && t < w.to);
    if (!win) return;
    const gather = t >= 160 && t < 165; // S28 向心收拢
    const rand = rng(20261022);
    const N = 28;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const seedX = rand();
      const seedY = rand();
      const size = lerp(1.6, 4, rand());      // 4K：0.8–2px ×2
      const speed = lerp(4, 10, rand()) * 2; // 4K px/s
      const life = lerp(6, 10, rand());
      const phase = rand();
      const age = ((t / life + phase) % 1) * life;
      const alpha = lerp(0.2, 0.45, rand());
      let x, y;
      if (gather) {
        const p = ease['ease-out'](seg(t, 160, 165));
        x = lerp(seedX * STAGE_W, STAGE_W / 2, p) + Math.sin(i) * 20;
        y = lerp(seedY * STAGE_H, STAGE_H / 2, p);
      } else {
        x = seedX * STAGE_W + Math.sin((t + i) * 0.6) * 18;
        y = STAGE_H - ((seedY * STAGE_H + age * speed) % STAGE_H);
      }
      const flicker = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.7);
      // 景深虚化：外层柔光晕
      ctx.beginPath();
      ctx.fillStyle = `rgba(232,177,92,${(alpha * 0.4 * flicker).toFixed(3)})`;
      ctx.arc(x, y, size * 3, 0, Math.PI * 2);
      ctx.fill();
      // 核心
      ctx.beginPath();
      ctx.fillStyle = `rgba(245,230,200,${(alpha * flicker).toFixed(3)})`;
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
