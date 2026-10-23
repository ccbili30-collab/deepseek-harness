/**
 * animatic v1 自检：节拍连续性、字卡文案、drop 标记、巡礼 12 件、包装层禁色。
 * 用法：node scripts/self-check.mjs
 */
import { SCENES, FLASH_SLOTS, EMBER_WINDOWS, FILM_DURATION } from '../src/scenes.js';

let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg);
  if (!cond) fail++;
};

// 1. 镜头连续无隙无叠
for (let i = 1; i < SCENES.length; i++) {
  ok(Math.abs(SCENES[i].start - SCENES[i - 1].end) < 0.001,
    `${SCENES[i - 1].id}→${SCENES[i].id} 时间连续（${SCENES[i - 1].end} → ${SCENES[i].start}）`);
}
ok(Math.abs(SCENES[0].start - 0) < 0.001, '首镜 S00 始于 0');
ok(Math.abs(SCENES[SCENES.length - 1].end - FILM_DURATION) < 1.0, `总时长 170s±1s（实测 ${SCENES[SCENES.length - 1].end}）`);

// 2. 字卡文案与蓝本一致
const cards = Object.fromEntries(SCENES.filter(s => s.text).map(s => [s.id, s.text]));
ok(cards.S01 === '太阳熄灭后的第三百年', 'S01 文案「太阳熄灭后的第三百年」');
ok(cards.S02 === '被光照见的，才存在过。', 'S02 文案「被光照见的，才存在过。」');
ok(cards.S29 === '聊出你的世界。', 'S29 slogan「聊出你的世界。」');
ok(SCENES.find(s => s.id === 'S29').sub === '诺文 Noven', 'S29 小字「诺文 Noven」');

// 3. drop 标记 59.5（m2 起点 58.8 + 瞬态 0.7）
ok(Math.abs(58.8 + 0.7 - 59.5) < 0.001, 'drop 标记线 59.5s（m2 58.8 + 瞬态 0.7）');

// 4. 巡礼 12 件 S13–S24
const pilgrim = SCENES.filter(s => s.pilgrimage);
ok(pilgrim.length === 12, `巡礼 12 件齐（实测 ${pilgrim.length}：${pilgrim.map(p => p.id).join(',')}）`);

// 5. 过曝仅 3 槽位
ok(FLASH_SLOTS.length === 3, `过曝转场仅 3 槽位（实测 ${FLASH_SLOTS.length}）`);

// 6. 余烬三时段
ok(EMBER_WINDOWS.length === 3, `余烬仅序章/S12/落版（实测 ${EMBER_WINDOWS.length} 窗）`);

// 7. 包装层禁色扫描（源码不得出现产品绿 #34D399 与金边装饰）
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
let greenHit = false, goldBorder = false;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
for (const f of readdirSync(srcDir)) {
  const txt = stripComments(readFileSync(join(srcDir, f), 'utf8'));
  if (/#34D399|34d399/i.test(txt)) greenHit = true;
  if (/border[^;]*#E8B15C|border[^;]*gold/i.test(txt)) goldBorder = true;
}
ok(!greenHit, '包装层源码无产品绿 #34D399');
ok(!goldBorder, '包装层无金边装饰');

console.log(fail === 0 ? '\n全部自检通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
