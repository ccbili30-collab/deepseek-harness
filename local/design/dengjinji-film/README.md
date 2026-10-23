# 《灯烬纪》宣传片 · Web 合成舞台（animatic v2）

蓝本：`local/design/灯烬纪-宣传片制作计划.md`（下称 §3 节拍表 / §5 视觉系统 / §6 音乐 / §8 管线）。
本目录是蓝本 §8 指定的 **3840×2160 Web 时间轴合成工程**：零运行时依赖（无框架、无构建），所有画面是全局时间 `t` 的纯函数，支持任意 `seek(t)`，供 Playwright 固定虚拟时钟逐帧导出。

当前产物：**占位素材 animatic 粗剪节奏验证片**（screen 镜头全部为暖深灰占位矩形，字卡/落版/余烬/光痕/字幕/光标/过曝/音乐/真实音效全部真实渲染）。

- v1：占位 lavfi 合成音效，逐帧渲出 `animatic-v1.mp4`。
- v2：§6 全部 16 段真实文生音频替换占位（见 §7.4 来源记录），重混 `mix.wav`，复用 v1 画面流 `-c:v copy` 封装 `animatic-v2.mp4`（未重渲，见 §9 视觉修复说明）。
- **v3**（当前）：接入已验收真实素材（19 镜：7 动态录屏 + 10 巡礼静帧 + S15 双源 + S24），确定性视频帧寻址，导出 `film-v3-preview.mp4`（见 §11）。

## 1. 运行方式（零依赖）

工程不装任何 npm 包。任选一种静态服务器：

```sh
# 方式 A：Node 内置（工程自带）
node scripts/serve.mjs 8123
# 方式 B：python3
python3 -m http.server 8123
# 方式 C：npx serve（临时，不写入依赖）
npx serve -l 8123 .
```

浏览器打开 `http://127.0.0.1:8123/index.html`。底部控制条：播放/暂停、拖动寻址、时间码、当前镜号。
导出模式（隐藏 HUD）：`index.html?clean=1`（渲染脚本自动带）。

## 2. 目录约定

```
dengjinji-film/
├── index.html              # 舞台入口（3840×2160 逻辑，CSS 等比缩放适配视口）
├── package.json            # 仅脚本声明，无依赖
├── src/
│   ├── scenes.js          # ★ S00–S29 节拍权威数据（起止/类型/字幕/音乐/音效/运镜标注）
│   ├── engine.js          # 极简 tween 引擎：seg/缓动/播种 PRNG/纯函数 seek 约束
│   ├── stage.js           # 包装层渲染：字卡/槽位/缓推/光痕/点亮/过曝/余烬/光标/字幕
│   ├── audio.js           # Web Audio 预览时间轴（四段排程+包络；导出音轨走离线混音）
│   └── main.js            # 引导、视口适配、HUD、SFX 穿越触发、录屏注入钩子
├── assets/
│   ├── music/             # m1–m4 原曲 + mix.wav（离线混音成品，.gitignore 忽略）
│   ├── sfx/              # 16 段文生音频真实音效（来源见 §7.4，可商用）
│   ├── recordings/        # 动态录屏（mp4/webm 3360×1890@60），见 §6
│   └── stills/           # 巡礼静帧 PNG（3360×1890），舞台缓推
├── scripts/
│   ├── serve.mjs          # 零依赖静态服务器
│   ├── mix-audio.mjs      # 离线混音：四段音乐 + assets/sfx 真实音效 → mix.wav（loudnorm -16）
│   └── render-animatic.mjs# Playwright 逐帧截获 + ffmpeg 封装
├── 录屏-导出/             # 帧序列与中间产物（不入成片交付）
└── 素材接入台账.md         # S03…S27 每镜录屏规格/命名/到位状态
```

## 3. 架构约束（为什么能逐帧导出）

- **一切画面是全局 `t` 的纯函数**：`window.__seek(t)` 从任意时刻重建完全相同画面；不使用 rAF 累积状态、视觉粒子用 `mulberry32` 播种 PRNG，不用 `Math.random`。这是固定虚拟时钟逐帧截获的前提。
- 镜头数据集中在 `src/scenes.js`，改节奏只改这一处。
- 包装层色板严格按 §5：背景 `#000000`、灯芯暖白 `#F5E6C8`、灯火金 `#E8B15C`、正文 `#F2EDE3`、次要 `#8A8378`。**产品绿 `#34D399` 只允许出现在真实 UI 录屏里，包装层零绿；无金边/纸纹/卷轴/哥特字/lens flare/弹簧动效。**

## 4. 字体现状

- 蓝本要求思源黑体 ExtraLight/Light；**本机未安装思源黑体**（不下载盗版字体）。
- 当前字体栈：`"Source Han Sans SC","Noto Sans SC","PingFang SC","Hiragino Sans GB","STHeiti Light",sans-serif`。macOS 实际回退到 PingFang SC / Hiragino Sans GB（细字重观感接近）。正式出片前由设计侧补授权思源黑体并替换栈首。
- 字卡参数（§5，4K 母版）：112–128px、字重 200–300、字距 0.02em、行距 1.8、单行成卡；淡入 600ms `cubic-bezier(.22,1,.36,1)` → 停留 → 淡出 400ms，无位移无发光。

## 5. 包装能力对照（§5 全部落地）

| 能力 | 实现位置 | 参数 |
|---|---|---|
| 黑场字卡 | `stage.js#paintCard` | 淡入 600ms card bezier / 淡出 400ms / 居中单行 |
| 屏幕槽位 | `stage.js#paintSlot` | 3360×1890 浮于 3840×2160 黑舞台中央；阴影 `0 40px 120px rgba(0,0,0,.9)`；暖光环境 `radial rgba(232,177,92,.06)` |
| 统一缓推 | `stage.js#paintSlot` push | 5–7″ scale 100→104%，线性偏 ease-out（S27 反向缓拉 100→97%） |
| 模块名/光痕 | `stage.js#paintTrace` | 1px 暖金完整横划 560px 居中、scaleX 揭示 0.8″ → 浮名；28–32px、字距 0.08em、暖白 85%（蓝本 60px/s×0.8s 在 4K 仅 48px 不可读，改以观感为准取完整横划） |
| 巡礼点亮 | `stage.js#reveal` | 径向暖光 600ms ease-out，只作用于槽位蒙版 |
| 过曝转场 | `stage.js#paintFlash` | 3 槽位：13.6（S02→S03）/ 67.6（S12 收尾）/ 137.6（S24→S25）；峰值 ≤92% 暖白 |
| 余烬 canvas | `stage.js#paintEmbers` | ≤30 粒、0.8–2px(4K×2)、上飘 4–10px/s、寿命 6–10s、景深虚化、暖金 20–45%；仅序章(0–14)/S12(59–68)/落版(160–170) |
| 虚拟光标 | `stage.js#paintCursor` | 暖白 12px(4K 24px) 圆点 + 点击 300ms 涟漪；animatic 演示 S04/S09/S12c |
| S11 四缘压光 | `stage.js#paintVignette` | 黑→8% 暖光 2s；纯包装压光，不显示占位槽位文字 |

## 6. 真实录屏接入方式

录屏规范（§8）：逻辑 1680×945、`deviceScaleFactor=2`（源 3360×1890）、60fps、webm/mp4，落 `assets/recordings/`；巡礼静帧落 `assets/stills/`（3360×1890 PNG）。

挂接由 `src/scenes.js` 每镜的 `media` 描述驱动（不再使用 manifest.json / `__setVideo`）：

```js
// 单段视频：from/to=镜头本地秒，in/out=源文件秒，线性映射
media: { kind:'video', src:'assets/recordings/s05-rule_1.mp4',
         segs:[{ from:0, to:5, in:8.0, out:15.5 }] },
// 一镜多源（S15 数据球→圣城）：segs 分段各自带 src
media: { kind:'video', segs:[
  { from:0, to:2, src:'assets/recordings/s15-data-sphere_1.webm', in:0, out:2 },
  { from:2, to:7, src:'assets/recordings/s15-3d-world_1.webm', in:0, out:5 },
]},
// 巡礼静帧：缓推由舞台 push 负责
media: { kind:'still', src:'assets/stills/s13-world-overview.png' },
```

- 无 `media` 的镜号自动回退占位暖深灰矩形；挂上后占位隐藏。
- **确定性帧寻址**：舞台对暂停 `<video>` 设 `currentTime` 并 `await seeked`，不依赖实时播放速率，因此逐帧导出不抖。静态服务器必须支持 HTTP Range（206），否则暂停视频 seek 会退回 0；`scripts/serve.mjs` 已实现分片。
- 已接入镜号、选定文件与源 in→out 裁切点见 `素材接入台账.md`「v3 已接入清单」。

## 7. 音乐对齐方案与差距清单（实测能量曲线）

### 7.1 实测（ffmpeg astats/RMS 0.5s 窗 + 0.1s 细测）

| 轨 | 时长 | 实测特征 |
|---|---|---|
| m1-open.wav | 45.0s | 连续钢琴织体，22–35s 最密，39→44.5s 自然散尽；<80Hz 低桶仅 -42~-56dB，**无 55Hz drone  bodies** |
| m2-drop.wav | 45.0s | 0–0.5s 近静默(-77dB)，**0.6s 起 -44dB，0.7s 全能量 -8dB（drop 瞬态）**； sustain 至 39s，40→43.5s 散尽 |
| m3-pilgrimage.wav | 70.0s | 0→6s 淡入，19–23dB pad 平推至 51s，52→69s 散尽；**正好覆盖巡礼 68→138（70s）** |
| m4-end.wav | 30.0s | 0–1.7s 静默，1.8s 起，5–9s 峰，25→29.5s 散尽 |

### 7.2 animatic 排程（`audio.js` MUSIC_PLAN / `mix-audio.mjs`）

| 轨 | 全局起点 | 处理 | 对齐点 |
|---|---|---|---|
| m1 | 0.00 | 淡入 0.5s，44→45.5s 淡出 | 序章→第一幕 |
| m2 | **58.80** | 淡入 0.15s，68→72s 淡出压在 m3 下 | **drop 瞬态（素材 0.7s）压全局 59.50** |
| m3 | 68.00 | 淡入 2s，136.5→138s 淡出 | 巡礼铺满 70s |
| m4 | 136.20 | 淡入 1s，165→168s 淡出 | 首音对齐 138.0（素材 1.8s 前奏） |

### 7.3 差距清单与 v2 补齐状态（精确到秒）

| # | 缺口 | 蓝本要求 | v2 状态 | 剩余备注 |
|---|---|---|---|---|
| 1 | **55Hz 序章 drone** | 0:00–0:14 低频 drone 铺底 | ✅ `drone-55hz.wav` 0.0s 入，fadeIn 1s / 12→14s 淡出，gain .32 | 纯生成音色，正式可换实录 55Hz |
| 2 | **0:59.5 drop** | drop 压世界卡名字帧 | ✅ m2 瞬态（58.8+0.7=59.5）+ `drop-boom.wav` 59.5s 低频轰叠颗粒 | 精修仍需对真实录屏起音 ±2 帧 |
| 3 | S09/S10 心跳 | 46–57s 60bpm×4 近静默 | ✅ `heartbeat.wav` 46.5s 入（7s 床），gain .5 | 生成四跳，60bpm；S09/S10 已按真机顺序对调（先切创作模式 48.5，再打字 51.0） |
| 4 | 57–59.5 riser | 2s 滤波噪声上扫 | ✅ `riser.wav` 57.0s，取前 2.5s，gain .3 | — |
| 5 | 62.7 颂钵/钟 | 长延音 8s | ✅ `bowl.wav` 62.7s，gain .5，自然 8s 衰减 | — |
| 6 | 1:16=76 / 1:29=89 远钟 | m3 内两次远钟 | ✅ `bell-distant.wav` 分别叠 76.0 / 89.0，gain .28 | — |
| 7 | 1:14=74 大提琴长音 | S14 进 | ✅ `cello.wav` 74.0s 入，20s 层，fadeIn 2s | 垫到 94s |
| 8 | 2:33=153 钢琴动机回响 | 首尾呼应 | ✅ `piano-echo.wav` 153.0s，两音大五度+长回声 | — |
| 9 | 2:49.5=169.5 灯芯噼啪 | 收尾一声 | ✅ `crackle.wav` 169.5s，取前 0.4s，gain .9 | — |
| 10 | 音效库六项 | 软打字/油灯嗒/纸火簌/风沙/金属鸣/星火 | ✅ 全部生成并按 §6 落点叠（见 §7.5 落点表） | 生成音色，正式可换实录 |

### 7.4 素材来源记录（全部 text_to_audio_plus 文生音频，2026-10-23，可商用，无人声/无宗教旋律）

工具：`text_to_audio_plus`（文生音频，pcm_s16le / 40000Hz 立体声）。下列为每段 prompt 原文；本地文件以 `assets/sfx/` 为准，临时短链可能过期。

| 文件 | 落点 | prompt 原文 |
|---|---|---|
| drone-55hz.wav | 0.0（14s） | 极简低频氛围 drone：55Hz 左右持续低沉嗡鸣，温暖、缓慢呼吸般轻微起伏，极弱泛音，像长夜将尽前的地底余温。无人声、无旋律、无打击、无宗教感，干净可混音，14 秒，开头 1s 淡入、结尾 2s 淡出。 |
| heartbeat.wav | 46.5（7s） | 安静房间里四次柔和心跳，60bpm，低沉胸腔搏动"咚……"间隔均匀，每跳带低频回弹，四跳分布 7 秒，其余安静。无人声、无音乐、无杂音，干净可混音。 |
| riser.wav | 57.0（取2.5s） | 紧张蓄势 riser：滤波白噪声从低沉被捂住的嗡声开始，平滑向上扫高变亮变密，2.5s 推向高点但不爆开。无人声、无旋律、无鼓点，干净可混音。 |
| bowl.wav | 62.7（8s） | 暖铜颂钵轻击一声后的自然长延音，浑厚泛音层层展开缓慢衰减 8s 到寂静。无人声、无诵经、无宗教吟唱、无旋律，教堂般自然混响，干净可混音。 |
| bell-distant.wav | 76.0 / 89.0 | 一记极远低沉钟，远方传来，带 3s+ 悠长混响尾音消散，朦胧被距离软化。无人声、无旋律、无其他乐器，干净可混音。 |
| cello.wav | 74.0（20s） | 大提琴持续拉奏低沉长音铺底，温暖略带叹息，饱满不张扬，缓慢起伏，20s，无明显旋律线条、无人声、无伴奏，干净可混音垫底。 |
| piano-echo.wav | 153.0（5s） | 钢琴轻弹两个相隔大五度的音，第一音柔和落下第二音随后，带很长空间回声消散 5s，深夜独处回味。无人声、无旋律发展、无其他乐器，干净可混音。 |
| crackle.wav | 169.5（取0.4s） | 油灯灯芯点燃后一声清脆温暖的轻微噼啪爆响随即安静，干燥暖木质感，1–2s，无人声、无音乐，干净可混音。 |
| typing-soft.wav | 15.0 / 51.0 / 139.5 | 非常轻柔安静的机械键盘打字，力量反馈很轻，键帽闷而不脆，慢速零星敲出十几个字符，4.5s，无青轴尖锐咔哒、无人声、无音乐，干净可混音。 |
| typing-fast.wav | 28.5 / 33.3 / 37.3 / 41.3 | 轻柔略快的机械键盘打字，安静环境键帽闷柔，连续快速敲一段，3s，无尖锐咔哒、无人声、无音乐，干净可混音。 |
| lamp-tap.wav | 24.5 / 48.5（S09 切换）/ 56.2（S10 回车）/ 62.7 / 148 / 150 | 油灯旁一次轻微选项点击"嗒"，暖木与软金属质感，短促克制不刺耳，0.3s 单声，无人声、无音乐，干净可混音。 |
| paper-rustle.wav | 12 次揭幕 | 纸张与干燥余火被轻翻的"簌"声，沙沙干燥温暖，短而轻，1s，像火苗舔过纸边，无人声、无音乐，干净可混音。 |
| wind-sand.wav | 81.0 / 131.0 | 极轻风沙与夜风，低空气流拂过沙面缓缓起伏 7s，空旷远方，无呼啸夸张、无人声、无旋律，干净可混音。 |
| metal-chime.wav | 126.8（3s） | 古铜金属灯身被轻触一声柔鸣，细小带悠长铜质泛音共振，不响不刺耳，3s 自然衰减，无人声、无音乐、无叮铃声，干净可混音。 |
| sparkle.wav | 59.5（8s） | 稀疏上升星火颗粒：一粒粒细小高频微光"叮叮"闪烁，由密到疏缓慢飘升，8s，轻盈梦幻，无人声、无旋律、无鼓点，干净可混音。 |
| drop-boom.wav | 59.5（取1.8s） | 一次沉重落盘低频轰响，低沉大鼓般闷轰带一点空气颗粒质感，起始有力 2s 内迅速衰减，无人声、无旋律、无碎裂杂音，干净可混音。 |

### 7.5 v2 音效落点时间码（全局秒，`mix-audio.mjs` sfx[]）

| 时间码 | 音效 | 时间码 | 音效 |
|---|---|---|---|
| 0.0 | drone-55hz（14s） | 62.7 | bowl 颂钵 8s + lamp-tap |
| 15.0 | typing-soft（S03） | 68.8…131.8×12 | paper-rustle 揭幕 |
| 24.5 | lamp-tap（S04） | 74.0 | cello 大提琴层 |
| 28.5/33.3/37.3/41.3 | typing-fast（S05–S08） | 76.0 / 89.0 | bell-distant 远钟×2 |
| 46.5 | heartbeat（7s 床） | 81.0 | wind-sand（S15） |
| 48.5 | lamp-tap（S09 探索→创作切换） | 126.8 | metal-chime（S23） |
| 51.0 | typing-soft（S10 逐字打字） | 131.0 | wind-sand（S24） |
| 56.2 | lamp-tap（S10 回车） | | |
| 57.0 | riser（2.5s） | 139.5 | typing-soft（S25） |
| 59.5 | drop-boom + sparkle（8s） | 148/150 | lamp-tap（S26） |
| 59.5 | m2 drop 瞬态 | 153.0 | piano-echo |
| | | 169.5 | crackle 收尾 |

### 7.6 v2 混音电平

- 输入（loudnorm 前）Integrated −19.1 LUFS / True Peak −1.0 dBTP；**成品 −15.7 LUFS、True Peak −1.5 dBTP、LRA 13.8（无削波）**，单遍 `loudnorm=I=-16:TP=-1.5:LRA=11`。
- 源内偏响已压：drop-boom(源 +2.5dB)/riser(+2.3)/wind-sand(+1.7) 均在 gain 层压低；sparkle/crackle 源内极弱故抬高。

## 8. 导出两条路径

### 路径 A：固定虚拟时钟逐帧截获（主路径，帧级精确）
```sh
node scripts/render-animatic.mjs                 # 30fps / 1080p 全片
node scripts/render-animatic.mjs --fps 15         # 快速闭环
node scripts/render-animatic.mjs --smoke 12       # 只渲前 12s 验流程
```
脚本用仓库 `apps/web/node_modules` 的 playwright 真 Chromium，`__seek(t)` 逐帧截 `#stage`，ffmpeg libx264 + aac 封装。60fps 参数预留（`--fps 60`）。

### 路径 B：MediaRecorder/Playwright 实时录像（备选，证明时间寻址可用）
```sh
node scripts/render-animatic.mjs --mode realtime
```
逐帧 5100 张 PNG 在慢机器上偏重时用此路径留实时参考；精修帧级对位仍走 A。

### ffmpeg
系统 PATH 无 ffmpeg；使用静态二进制（7.1，libx264/aac 可用），路径可用环境变量 `FFMPEG_BIN` 覆盖，默认指向 imageio_ffmpeg 自带。

## 9. 自检门（animatic v2）

**画面（沿用 v1 帧，`-c:v copy`）**
- [x] 总时长 170.00s±1s（S29 止于 170.0），1920×1080@30fps，h264+aac
- [x] S01「太阳熄灭后的第三百年」/ S02「被光照见的，才存在过。」/ S29「聊出你的世界。」+「诺文 Noven」文案一致
- [x] drop 标记线 59.5s（m2 起点 58.8 + 瞬态 0.7，叠 drop-boom）
- [x] 巡礼 12 件齐：S13–S24（世界总览/大陆地图/3D/时间线/势力/族群/阿檐/沉七/谢拾遗/燃术规则/残日灯/光蚀地图）
- [x] 包装层无绿、无金边、无纸纹、无镜头光晕贴图
- [x] 过曝仅 3 槽位（13.6 / 67.6 / 137.6）
- [x] 余烬仅序章/S12/落版三时段

**音频（v2 重混）**
- [x] 成品 −15.7 LUFS / True Peak −1.5 dBTP / LRA 13.8，无削波
- [x] 16 段真实音效全部按 §6 落点可辨（drone/心跳/riser/drop/bowl/远钟×2/大提琴/钢琴回声/噼啪/打字×3 类/油灯嗒×5/纸火×12/风沙×2/金属鸣/星火）
- [x] 无人声、无宗教旋律、无圣歌；全部文生可商用并在 §7.4 留档

**视觉修复说明（已入源码，v2 画面不体现）**
v2 按要求复用 v1 画面流未重渲，两处修复只落在 `src/stage.js`，下一帧渲（真实录屏接入后）生效：
1. 巡礼光痕由 240px 短划改为 560px 居中完整横划、scaleX 从中心揭示（4K 可读）。
2. S11 vignette 不再显示占位槽位文字（`showSlot = type==='screen'`）。

## 10. 重出 v2（只换音轨，不重渲）

```sh
node scripts/mix-audio.mjs        # 重混 assets/music/mix.wav
ffmpeg -i animatic-v1.mp4 -i assets/music/mix.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -t 170 animatic-v2.mp4
```
若真实录屏接入后需重渲画面，走 §8 路径 A，新音轨自动复用。

## 11. v3 成片合成准备（真实素材接入预览）

- 输出：`/Users/noven/Documents/Codex/灯烬纪/_制作/录屏/animatic/film-v3-preview.mp4`，1920×1080@30fps，画面 + `assets/music/mix.wav`（aac）。
- 已接入 19 镜（7 段动态录屏 + 10 张巡礼静帧 + S15 双源 + S24 动态），选定文件与源 in→out 见 `素材接入台账.md`「v3 已接入清单」；S10、S12(a–g)、S25、S26、S27 重录中，保留占位。
- **确定性视频帧寻址**：视频池按 src 复用 `<video>`（muted/paused/preload=auto），每帧设 `currentTime` 并 `await seeked`；静帧 `img.decode()`。`__warmup()` 在导出前解码全部静帧、加载全部视频元数据。
- **HTTP Range 必需**：暂停视频任意 seek 依赖 206 分片；`scripts/serve.mjs` 已实现 `bytes=` Range，否则 `currentTime` 退回 0。
- 60fps 仅预留（`--fps 60`），v3 先 30fps 闭环；终版再上 60。
- 已知缺口（终版处理）：S09 缺「末轮回答静止+光标闪2次」会话内菜单特写；S13–S23 静帧为白底 wiki 截图，终版需压暗/调色；S15/S24 画面内带「重新运镜/重新巡礼/灯油条」等应用控件，终版需裁切或遮罩。
