/**
 * Animatic 导出：Playwright 真 Chromium 固定虚拟时钟逐帧截获舞台 → PNG 序列 → ffmpeg H.264 + mix.wav 封装。
 *
 * 用法（工程根目录）：
 *   node scripts/render-animatic.mjs                  # 默认 30fps / 1080p / 全片 170s
 *   node scripts/render-animatic.mjs --fps 15         # 快速闭环
 *   node scripts/render-animatic.mjs --smoke 12      # 只渲前 12s 验证流程
 *   node scripts/render-animatic.mjs --mode realtime # MediaRecorder 实时录制备选路径
 *
 * 输出默认：/Users/noven/Documents/Codex/灯烬纪/_制作/录屏/animatic/film-v3-preview.mp4
 * 依赖：仓库 apps/web/node_modules 的 playwright（createRequire 解析）；ffmpeg 静态二进制（见 README）。
 * 视频帧按 currentTime 确定性 seek（await seeked），不依赖实时播放；--fps 60 预留终版。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = process.env.REPO_ROOT || '/Users/noven/Documents/Codex/noven-pc';
const FF = process.env.FFMPEG_BIN || '/Users/noven/Library/Application Support/DoubaoWork/sandbox_runtime/bases/98670218a5f0d8bc9b9ebf3f70881304/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1';

// ── 参数 ──
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? (argv[i + 1] ?? true) : d;
};
const fps = Number(opt('--fps', 30));
const W = Number(opt('--width', 1920));
const H = Number(opt('--height', 1080));
const smoke = opt('--smoke', null) ? Number(opt('--smoke')) : null;
const mode = opt('--mode', 'frames');
const outDefault = '/Users/noven/Documents/Codex/灯烬纪/_制作/录屏/animatic/film-v3-preview.mp4';
const out = resolve(opt('--out', outDefault));
const DURATION = 170;

const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright');

// ── 起静态服务 ──
const serve = spawn(process.execPath, [join(root, 'scripts/serve.mjs'), '8199'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const frameDir = join(root, '录屏-导出', `frames-${fps}fps`);
mkdirSync(dirname(out), { recursive: true });
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8199/index.html?clean=1');
await page.waitForFunction(() => typeof window.__seek === 'function');
// 预热：解码全部静帧、加载全部视频元数据（确定性寻址前必须完成）
await page.evaluate(() => window.__warmup?.());
await page.waitForTimeout(1500);

const total = smoke ? Math.ceil(smoke * fps) : Math.ceil(DURATION * fps);

if (mode === 'realtime') {
  // 备选路径：Playwright 内置录像（实时），验证时间寻址可用 + 留一条实时参考
  const recDir = join(root, '录屏-导出', 'realtime');
  mkdirSync(recDir, { recursive: true });
  const p2 = await (await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: recDir, size: { width: W, height: H } },
  })).newPage();
  await p2.goto('http://127.0.0.1:8199/index.html?clean=1');
  await p2.waitForFunction(() => window.__playRealtime);
  await p2.evaluate(() => window.__playRealtime());
  await p2.waitForTimeout((smoke ?? DURATION) * 1000 + 500);
  await p2.close();
  await browser.close();
  serve.kill();
  console.log('realtime 录像完成 →', recDir);
  process.exit(0);
}

// ── 逐帧固定时钟截获 ──
for (let i = 0; i < total; i++) {
  const t = i / fps;
  // await 到视频 seeked / 静帧解码完成，保证帧精确、不抖
  await page.evaluate((tt) => window.__seek(tt), t);
  await page.waitForTimeout(3); // seeked 已 await，仅留少量重绘余量
  const name = String(i).padStart(5, '0') + '.png';
  await page.locator('#stage').screenshot({ path: join(frameDir, name) });
  if (i % 100 === 0 || i === total - 1) {
    process.stdout.write(`\rframe ${i + 1}/${total}  t=${t.toFixed(2)}s`);
  }
}
console.log('\n帧序列完成 →', frameDir);

// ── ffmpeg 封装 ──
mkdirSync(dirname(out), { recursive: true });
const mix = join(root, 'assets/music/mix.wav');
const args = [
  '-y',
  '-framerate', String(fps), '-i', join(frameDir, '%05d.png'),
  '-i', mix,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
  '-r', String(fps),
  '-c:a', 'aac', '-b:a', '192k',
  '-t', '170', out,
];
console.log('ffmpeg', args.join(' '));
const r = spawnSync(FF, args, { stdio: 'inherit' });
await browser.close();
serve.kill();
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('\nanimatic →', out);
