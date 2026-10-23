/**
 * 离线混音：四段版权音乐（m1–m4）+ assets/sfx/ 文生音频真实音效 → mix.wav（170s 立体声）。
 * 浏览器预览用 Web Audio（src/audio.js）；本脚本专供导出成片音轨，无实时环境也可复现。
 *
 * 对齐（实测能量曲线，详见 README §7）：
 *  m1 0.00｜m2 58.80（drop 瞬态压 59.50）｜m3 68.00｜m4 136.20（首音对齐 138.0）
 * 音效落点严格按蓝本 §6 与 src/scenes.js 的 sfx 表。
 *
 * 用法：node scripts/mix-audio.mjs [out.wav]
 * 环境变量 FFMPEG_BIN 可覆盖 ffmpeg 路径。
 * 注意：afade 必须先作用于原始流，再 adelay 移位；顺序反了 afade 的 st 会按填充后的
 * 延迟流计算，导致整轨被提前淡出静音。
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const FF = process.env.FFMPEG_BIN || '/Users/noven/Library/Application Support/DoubaoWork/sandbox_runtime/bases/98670218a5f0d8bc9b9ebf3f70881304/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1';
const MUSIC = join(root, 'assets/music');
const SFX = join(root, 'assets/sfx');
const out = resolve(process.argv[2] || join(MUSIC, 'mix.wav'));

// ── 音乐轨：输入序号 0..3；fade 时间为原始流相对秒，最后 adelay 到全局起点 ──
const music = [
  { f: 'm1-open.wav', delay: 0.0, fadeIn: 0.5, outStart: 44.0, outDur: 1.5, gain: 0.85 },
  { f: 'm2-drop.wav', delay: 58.8, fadeIn: 0.15, outStart: 9.2, outDur: 4.0, gain: 0.9 },
  { f: 'm3-pilgrimage.wav', delay: 68.0, fadeIn: 2.0, outStart: 68.5, outDur: 1.5, gain: 0.9 },
  { f: 'm4-end.wav', delay: 136.2, fadeIn: 1.0, outStart: 28.8, outDur: 3.0, gain: 0.9 },
];

// ── 真实音效：file 在 assets/sfx/；at 全局秒；trim 取原始流前 N 秒；
//    fadeIn/out 为原始流相对秒；gain 0..1；同一文件可重复放置（每个放置占一个 -i）──
const sfx = [
  // §6 0:00–0:14 55Hz 序章 drone
  { f: 'drone-55hz.wav', at: 0.0, gain: 0.32, fadeIn: 1.0, outStart: 12.0, outDur: 2.0 },
  // S03 15.0 软打字（4.5s）
  { f: 'typing-soft.wav', at: 15.0, gain: 0.28 },
  // S05–S08 快剪打字（2–3× 倍速感，复用 fast）
  { f: 'typing-fast.wav', at: 28.5, gain: 0.22 },
  { f: 'typing-fast.wav', at: 33.3, gain: 0.22 },
  { f: 'typing-fast.wav', at: 37.3, gain: 0.22 },
  { f: 'typing-fast.wav', at: 41.3, gain: 0.22 },
  // S04 24.5 / S09 48.5 探索→创作切换 / S10 56.2 回车 / S12c 62.7 / S26 148、150 油灯"嗒"（选项·点击）
  { f: 'lamp-tap.wav', at: 24.5, gain: 0.3 },
  { f: 'lamp-tap.wav', at: 48.5, gain: 0.3 },
  { f: 'lamp-tap.wav', at: 56.2, gain: 0.22 },
  { f: 'lamp-tap.wav', at: 62.7, gain: 0.3 },
  { f: 'lamp-tap.wav', at: 148.0, gain: 0.22 },
  { f: 'lamp-tap.wav', at: 150.0, gain: 0.22 },
  // S09 46.5 起心跳 60bpm×4（7s 床，覆盖 S09/S10 近静默段）
  { f: 'heartbeat.wav', at: 46.5, gain: 0.5, fadeIn: 0.3, outStart: 6.0, outDur: 1.0 },
  // S10 51.0 逐字打字（停 0.8s 后 56.2 回车）
  { f: 'typing-soft.wav', at: 51.0, gain: 0.24 },
  // S11 57.0 起 2.5s riser（取前 2.5s）
  { f: 'riser.wav', at: 57.0, gain: 0.3, trim: 2.5, outStart: 2.2, outDur: 0.3 },
  // 0:59.5 drop 低频轰+颗粒（源内 +2.5dB 已削波，压低）
  { f: 'drop-boom.wav', at: 59.5, gain: 0.42, trim: 1.8, outStart: 0.8, outDur: 1.0 },
  // S12 59.5 起星火颗粒 8s
  { f: 'sparkle.wav', at: 59.5, gain: 0.22, outStart: 6.0, outDur: 2.0 },
  // S12c 62.7 颂钵/钟长延音 8s
  { f: 'bowl.wav', at: 62.7, gain: 0.5 },
  // 巡礼纸火"簌"（12 件揭幕，68.8…131.8）
  { f: 'paper-rustle.wav', at: 68.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 74.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 81.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 88.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 94.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 100.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 105.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 111.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 116.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 121.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 126.8, gain: 0.16 },
  { f: 'paper-rustle.wav', at: 131.8, gain: 0.16 },
  // S14 74.0 大提琴长音层（20s 覆盖巡礼前段）
  { f: 'cello.wav', at: 74.0, gain: 0.38, fadeIn: 2.0, outStart: 18.0, outDur: 2.0 },
  // 远钟两次：1:16=76.0、1:29=89.0
  { f: 'bell-distant.wav', at: 76.0, gain: 0.28 },
  { f: 'bell-distant.wav', at: 89.0, gain: 0.28 },
  // S15 81.0 风沙（3D 绕行长明京）
  { f: 'wind-sand.wav', at: 81.0, gain: 0.14, outStart: 5.5, outDur: 1.5 },
  // S23 126.8 残日灯金属轻鸣
  { f: 'metal-chime.wav', at: 126.8, gain: 0.55 },
  // S24 131.0 光蚀地图风沙
  { f: 'wind-sand.wav', at: 131.0, gain: 0.2, outStart: 5.5, outDur: 1.5 },
  // S25 139.5 新指令打字
  { f: 'typing-soft.wav', at: 139.5, gain: 0.24 },
  // 2:33=153 钢琴两音动机回响（首尾呼应）
  { f: 'piano-echo.wav', at: 153.0, gain: 0.45 },
  // 2:49.5=169.5 灯芯噼啪收尾（取前 0.4s，源内 rms 极低故抬高）
  { f: 'crackle.wav', at: 169.5, gain: 0.9, trim: 0.4 },
];

const inputs = [];
const filters = [];
const labels = [];

// 音乐：afade(in/out) → volume → adelay
music.forEach((tr, i) => {
  inputs.push('-i', join(MUSIC, tr.f));
  let chain = `[${i}]afade=t=in:st=0:d=${tr.fadeIn},`;
  chain += `afade=t=out:st=${tr.outStart}:d=${tr.outDur},volume=${tr.gain},`;
  chain += `adelay=${Math.round(tr.delay * 1000)}|${Math.round(tr.delay * 1000)}[m${i}]`;
  filters.push(chain);
  labels.push(`[m${i}]`);
});

// 音效：可选 atrim → afade → volume → adelay
sfx.forEach((s, k) => {
  const idx = music.length + k;
  inputs.push('-i', join(SFX, s.f));
  let chain = `[${idx}]`;
  if (s.trim) chain += `atrim=0:${s.trim},asetpts=PTS-STARTPTS,`;
  chain += `afade=t=in:st=0:d=${s.fadeIn ?? 0.02},`;
  if (s.outStart != null) chain += `afade=t=out:st=${s.outStart}:d=${s.outDur ?? 0.5},`;
  chain += `volume=${s.gain},`;
  chain += `adelay=${Math.round(s.at * 1000)}|${Math.round(s.at * 1000)}[x${k}]`;
  filters.push(chain);
  labels.push(`[x${k}]`);
});

// amix 不归一化，再单遍 loudnorm 到 -16 LUFS / TP -1.5，最后压到 170s
filters.push(
  `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,` +
  `loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary,` +
  `atrim=0:170,aresample=44100[mix]`
);

const args = [
  '-y', ...inputs,
  '-filter_complex', filters.join(';'),
  '-map', '[mix]',
  '-t', '170', '-ar', '44100', '-ac', '2', out,
];

console.log('ffmpeg inputs:', inputs.length);
const r = spawnSync(FF, args, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('mix →', out);
