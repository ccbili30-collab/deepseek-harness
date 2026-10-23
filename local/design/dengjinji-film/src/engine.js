/**
 * 极简时间轴 tween 引擎（零依赖）。
 * 核心约束：一切画面都是全局时间 t 的纯函数 —— seek(t) 必须可从任意时刻重建完全相同的画面，
 * 这是 Playwright 固定虚拟时钟逐帧导出的前提。不使用 rAF 累积状态、不使用 Math.random（视觉粒子用播种 PRNG）。
 */

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, p) => a + (b - a) * p;

/** 落在窗口 [from,to] 内的 0..1 进度，窗外夹取 */
export function seg(t, from, to) {
  return clamp01((t - from) / (to - from));
}

/** 缓动（§5：缓推线性偏 ease-out；字卡淡入 cubic-bezier(.22,1,.36,1)） */
export const ease = {
  linear: (x) => x,
  'ease-out': (x) => 1 - Math.pow(1 - x, 3),
  'ease-out-soft': (x) => 1 - Math.pow(1 - x, 2),
  // cubic-bezier(.22,1,.36,1) 的近似（强出缓入，发布会常用）
  card: (x) => 1 - Math.pow(1 - x, 3.2),
  // 径向点亮 600ms ease-out
  reveal: (x) => 1 - Math.pow(1 - x, 2.4),
};

/** 窗口内淡入淡出：fadeIn 秒进、hold、fadeOut 秒出，返回 0..1 不透明度 */
export function fadeWindow(t, start, end, fadeIn, fadeOut) {
  const inP = ease.card(seg(t, start, start + fadeIn));
  const outP = 1 - seg(t, end - fadeOut, end);
  return clamp01(Math.min(inP, outP));
}

/** mulberry32 播种 PRNG（可复现，供余烬/抖动使用） */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4K 舞台逻辑尺寸（§8：3840×2160 母版） */
export const STAGE_W = 3840;
export const STAGE_H = 2160;
/** 录屏槽位：3360×1890（1680×945 @dsf2），浮于黑舞台中央 */
export const SLOT_W = 3360;
export const SLOT_H = 1890;
