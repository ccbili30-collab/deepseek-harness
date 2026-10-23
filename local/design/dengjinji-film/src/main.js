/**
 * 预览引导：舞台适配视口、播放/暂停、拖动寻址、时间码、SFX 穿越触发、真实录屏注入钩子。
 * 导出脚本通过 window.__seek(t) / window.__stage 直接驱动，不依赖控件。
 */
import { Stage } from './stage.js';
import { MusicTimeline } from './audio.js';
import { SCENES, FILM_DURATION, sceneAt, tc } from './scenes.js';

// ?clean=1：导出模式，隐藏 HUD 控制条（逐帧截获时使用）
if (new URLSearchParams(location.search).has('clean')) {
  document.getElementById('hud').style.display = 'none';
}

const viewport = document.getElementById('stage-viewport');
const stageRoot = document.getElementById('stage');
const stage = new Stage(stageRoot);
const music = new MusicTimeline();

// ── 视口适配：3840×2160 等比缩放居中 ──
function fit() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const s = Math.min(vw / 3840, vh / 2160);
  stageRoot.style.transform = `scale(${s})`;
  stageRoot.style.transformOrigin = 'center center';
  viewport.style.width = `${3840 * s}px`;
  viewport.style.height = `${2160 * s}px`;
}
window.addEventListener('resize', fit);
fit();

// ── 播放时钟（预览用；导出走固定虚拟时钟，不用这里）──
let t = 0;
let playing = false;
let lastFrame = 0;

// SFX 事件表（扁平，含 heartbeat 多点）
const sfxMarks = [];
for (const sc of SCENES) {
  for (const s of sc.sfx || []) {
    if (s.times) for (const tm of s.times) sfxMarks.push({ at: tm, name: s.name });
    else sfxMarks.push({ at: s.at, name: s.name });
  }
}
sfxMarks.sort((a, b) => a.at - b.at);
let lastSfxIdx = 0;

function fireCrossedSfx(prev, now) {
  while (lastSfxIdx < sfxMarks.length && sfxMarks[lastSfxIdx].at <= now) {
    if (sfxMarks[lastSfxIdx].at > prev) music.sfx(sfxMarks[lastSfxIdx].name);
    lastSfxIdx++;
  }
  if (now < prev) lastSfxIdx = sfxMarks.findIndex((m) => m.at > now);
}

function frame(ts) {
  if (!lastFrame) lastFrame = ts;
  const dt = (ts - lastFrame) / 1000;
  lastFrame = ts;
  if (playing) {
    const prev = t;
    t = Math.min(FILM_DURATION, t + dt);
    fireCrossedSfx(prev, t);
    if (t >= FILM_DURATION) { playing = false; music.pause(); }
  }
  music.setCurrent(t);
  music.seek(t);
  stage.seek(t);
  renderHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── 控件 ──
const playBtn = document.getElementById('play');
const scrub = document.getElementById('scrub');
const timecode = document.getElementById('timecode');
const sceneLabel = document.getElementById('scene-label');

function renderHud() {
  scrub.value = t;
  timecode.textContent = `${tc(t)} / ${tc(FILM_DURATION)}`;
  const sc = sceneAt(t);
  sceneLabel.textContent = `${sc.id} · ${sc.placeholder?.name || sc.text || sc.type}`;
}

playBtn.addEventListener('click', async () => {
  if (playing) {
    playing = false; music.pause(); playBtn.textContent = '▶';
  } else {
    if (t >= FILM_DURATION) t = 0;
    playing = true; lastSfxIdx = sfxMarks.findIndex((m) => m.at > t);
    await music.play();
    playBtn.textContent = '⏸';
  }
});

scrub.addEventListener('input', () => {
  t = parseFloat(scrub.value);
  lastSfxIdx = sfxMarks.findIndex((m) => m.at > t);
  music.setCurrent(t);
  music.seek(t);
  stage.seek(t);
  renderHud();
});

scrub.max = FILM_DURATION;

// ── 媒体由 scenes.js 的 media 描述驱动；此钩子保留为兼容空操作 ──
window.__setVideo = () => {};

// realtime 备选录像路径：置 playing 后由现有 rAF 循环推进，到尾 resolve
window.__playRealtime = () => new Promise((resolve) => {
  playing = true;
  lastSfxIdx = sfxMarks.findIndex((m) => m.at > t);
  const iv = setInterval(() => {
    if (t >= FILM_DURATION) { clearInterval(iv); music.pause(); resolve(); }
  }, 100);
});
window.__stage = stage;
window.__music = music;
window.__warmup = () => stage.warmup();
window.__seek = async (tt) => {
  t = Math.max(0, Math.min(FILM_DURATION, tt));
  music.setCurrent(t);
  music.seek(t);
  await stage.seek(t);
  renderHud();
};
