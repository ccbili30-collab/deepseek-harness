/**
 * 《灯烬纪》宣传片 scenes 配置 —— 节拍权威来源，严格对应蓝本 §3（0:00–2:50 / 170s）。
 *
 * 全局时间轴单位：秒。所有镜头 start/end 连续无重叠无空隙。
 * type:
 *   breath    全黑 + 中心一粒暖光呼吸（S00）
 *   black-card 居中单行字卡（S01/S02）
 *   screen    录屏槽位（占位暖深灰矩形，真实 webm 替换见 素材接入台账.md）
 *   vignette  四缘暖光压入（S11）
 *   endcard   落版（S29）
 *
 * 标注字段（music/sfx/camera/note）只作导演备注，不参与渲染；真实录制/精修时照此对齐。
 *
 * media（已接入素材；缺省=占位暖深灰矩形）：
 *   { kind:'still', src }                          静帧 PNG，缓推由 slotWrap scale 负责
 *   { kind:'video', src, segs:[{from,to,in,out}] } 视频；segs 按镜头本地秒分段，
 *     from/to=镜头本地区间，in/out=源文件秒；segs 可自带 src（一镜多源，如 S15）。
 *     线性映射本地→源时间；确定性逐帧导出按 currentTime 精确寻址，不依赖播放速率。
 */

export const FILM_DURATION = 170; // 2:50，§3 总表末镜 S29 止于 02:50

// 过曝转场全片仅 3 次（§5）：S02→S03、S12 收尾、S24→S25
export const FLASH_SLOTS = [
  { at: 13.6, dur: 0.4, label: 'S02→S03 由光生 UI' },
  { at: 67.6, dur: 0.4, label: 'S12 收尾 光收束后炸开总览页' },
  { at: 137.6, dur: 0.4, label: 'S24→S25' },
];

// 余烬启用三时段（§5）：序章 / S12 / 落版
export const EMBER_WINDOWS = [
  { from: 0, to: 14 },
  { from: 59, to: 68 },
  { from: 160, to: 170 },
];

export const SCENES = [
  {
    id: 'S00', start: 0, end: 3, type: 'breath',
    music: '低频 drone 进（≈55Hz，现素材缺失，见 README 差距清单 #1）',
    sfx: [],
    camera: '静；中心 6px 暖光 4s 一周期极慢呼吸（亮度 0.8↔1.0）',
    note: '发布会式耐心，全黑保持 3 秒不放任何东西',
  },
  {
    id: 'S01', start: 3, end: 8, type: 'black-card',
    text: '太阳熄灭后的第三百年',
    music: '单音钢琴第 1 音（m1 内）',
    sfx: [{ name: 'piano-note-1', at: 3.2 }],
    camera: '静；字卡淡入 600ms → 停留 → 淡出 400ms，无位移',
    note: '第一张字卡，单行居中',
  },
  {
    id: 'S02', start: 8, end: 14, type: 'black-card',
    text: '被光照见的，才存在过。',
    flash: { at: 13.6, dur: 0.4 },
    music: '钢琴第 2 音，长尾（m1 内）',
    sfx: [{ name: 'piano-note-2', at: 8.2 }],
    camera: '静；尾帧 0.4s 暖白过曝（峰值 ≤92%），白光中浮出创作页',
    note: '全片第一次、也是唯一一次“由光生 UI”',
  },
  {
    id: 'S03', start: 14, end: 21, type: 'screen',
    placeholder: { name: '创作页浮现 · 输入种子句并发送', sub: '种子句：我想做一个世界：太阳熄灭了三百年。黑透的地方，人会连同别人对他的记忆一起消失。' },
    push: { to: 1.03, dur: 7 },
    media: { kind: 'video', src: 'assets/recordings/s03-seed-transition_1.mp4', segs: [{ from: 0, to: 7, in: 3.5, out: 10.5 }] },
    music: '钢琴脉冲开始（m1 内），极轻打字声',
    sfx: [{ name: 'typing', at: 15.0, dur: 4.5 }],
    camera: '7s 内 100%→103% 极缓推；产品自带仪式转场（种子起/页散/落座）原样录',
    note: '界面干干净净，只有对话在长；不给内容树',
    asset: 's03-explore-seed.webm',
  },
  {
    id: 'S04', start: 21, end: 28, type: 'screen',
    placeholder: { name: '探索模式会话 · AI 反问 + 选项卡，点选 B', sub: 'AI：这个念头上岸，先不定任何设定。告诉我：这里的光，对人意味着什么？／A 光是最后的秩序，人人守灯／B 光本身成了压迫，亮处才有资格活着' },
    push: { to: 1.02, dur: 7 },
    media: { kind: 'video', src: 'assets/recordings/s04-option-select_1.mp4', segs: [{ from: 0, to: 7, in: 0.2, out: 7.2 }] },
    subtitle: { text: '探索模式 · 只交流，不落笔', at: 22, dur: 4 },
    cursor: [{ at: 24.5, x: 0.66, y: 0.62, click: true }],
    music: '脉冲；选项点击=轻“嗒”',
    sfx: [{ name: 'ui-tap', at: 24.5 }],
    camera: '静；B 卡产品选中态（灰底深字）定格 0.6s；本片唯一解释性字幕（22–26s 淡入淡出）',
    note: '虚拟光标演示点选 B（真实录制时对齐录屏内点击帧）',
    asset: 's04-explore-options.webm',
  },
  {
    id: 'S05', start: 28, end: 33, type: 'screen',
    placeholder: { name: '快剪 · 核心规则确立', sub: '「被光照见的，才存在过」→ AI 追问“那灯油归谁管”' },
    push: { to: 1.015, dur: 5 },
    media: { kind: 'video', src: 'assets/recordings/s05-rule_1.mp4', segs: [{ from: 0, to: 5, in: 8.0, out: 15.5 }] },
    music: '节奏渐密（m1 内）',
    sfx: [{ name: 'typing-fast', at: 28.5, dur: 3 }],
    camera: '镜头固定；切点压在对话气泡入场动效中段；打字 2–3 倍速（源 7.5s 压进 5s）',
    note: '快剪第 1 轮（5″）',
    asset: 's05-rule.webm',
  },
  {
    id: 'S06', start: 33, end: 37, type: 'screen',
    placeholder: { name: '快剪 · 燃术与半蚀者', sub: '以记忆为燃料施法；用多了人逐渐变透明，称“半蚀者”' },
    push: { to: 1.015, dur: 4 },
    media: { kind: 'video', src: 'assets/recordings/s06-ritual_1.mp4', segs: [{ from: 0, to: 4, in: 8.0, out: 12.5 }] },
    music: '加密（m1 内）',
    sfx: [{ name: 'typing-fast', at: 33.3, dur: 2.2 }],
    camera: '镜头固定；4″ 轮',
    note: '快剪第 2 轮',
    asset: 's06-ritual.webm',
  },
  {
    id: 'S07', start: 37, end: 41, type: 'screen',
    placeholder: { name: '快剪 · 灯史职业', sub: '提灯记录的人，写下就能多存在一阵' },
    push: { to: 1.015, dur: 4 },
    media: { kind: 'video', src: 'assets/recordings/s07-lamp-history_1.mp4', segs: [{ from: 0, to: 4, in: 9.0, out: 13.0 }] },
    music: '加密（m1 内）',
    sfx: [{ name: 'typing-fast', at: 37.3, dur: 2.2 }],
    camera: '镜头固定；4″ 轮',
    note: '快剪第 3 轮',
    asset: 's07-lamp-history.webm',
  },
  {
    id: 'S08', start: 41, end: 46, type: 'screen',
    placeholder: { name: '快剪 · 四方势力与三角色', sub: '长明灯庭／拾烬者／慕暗者＋阿檐、沉七、谢拾遗；末名落定瞬间音乐滤波抽空' },
    push: { to: 1.015, dur: 5 },
    media: { kind: 'video', src: 'assets/recordings/s08-factions-roles_1.mp4', segs: [{ from: 0, to: 5, in: 23.5, out: 28.5 }] },
    music: '到最密 → 低通滤波抽空，环境声全灭（m1 尾段 44–46 压低/静音）',
    sfx: [{ name: 'typing-fast', at: 41.3, dur: 2.6 }],
    camera: '镜头固定；三连快切；末尾音乐抽空一拍',
    note: '快剪第 4 轮（5″），为 S09 静默蓄力',
    asset: 's08-factions-roles.webm',
  },
  {
    id: 'S09', start: 46, end: 50, type: 'screen',
    placeholder: { name: '探索末轮回答静止 → 探索模式→创作模式切换特写', sub: '最后一轮回答静止在屏；光标匀速闪 2 次，composer 预设菜单「探索模式 → 创作模式」切换，配灯芯“噗”' },
    push: { to: 1.02, dur: 4 },
    media: { kind: 'video', src: 'assets/recordings/s09-seat-switch_1.mp4', segs: [{ from: 0, to: 4, in: 0.6, out: 4.6 }] },
    cursor: [{ at: 48.5, x: 0.5, y: 0.42, click: true }],
    music: '近静默，仅心跳低频（≈60bpm 4 下）',
    sfx: [{ name: 'heartbeat', at: 46.5, times: [46.5, 48.2, 49.9, 51.6] }, { name: 'lamp-puff', at: 48.5 }],
    camera: '近景静；切换特写，不给解释字幕，动作本身人人懂',
    note: '真实操作顺序：先切创作模式，再下建世界指令（原 S09/S10 对调）；虚拟光标演示切换（第 2 处）',
    asset: 's09-mode-switch.webm',
  },
  {
    id: 'S10', start: 50, end: 57, type: 'screen',
    placeholder: { name: '逐字打出「挺好，就按这个，帮我全部建出来吧。」回车', sub: '同一会话输入框逐字打完，停 0.8s 后回车' },
    push: { to: 1.0, dur: 7 },
    media: { kind: 'video', src: 'assets/recordings/s10-one-sentence_1.mp4', segs: [{ from: 0, to: 7, in: 1.5, out: 8.5 }] },
    cursor: [{ at: 56.2, x: 0.5, y: 0.86, click: true }],
    music: '近静默',
    sfx: [{ name: 'typing', at: 51.0, dur: 5.0 }, { name: 'return-enter', at: 56.2 }],
    camera: '7s 长镜头不切；静',
    note: '全片蓄力点；m1 已抽空，此段近静默',
    asset: 's10-one-sentence.webm',
  },
  {
    id: 'S11', start: 57, end: 59, type: 'vignette',
    placeholder: { name: '蓄力 · 屏幕四缘暖光缓缓压入', sub: '从黑到 8% 暖光（vignette 反用），画面不动' },
    music: '低频 riser 2″（57–59.5 占位合成，推向 drop）',
    sfx: [{ name: 'riser', at: 57.0, dur: 2.5 }],
    camera: '静；四边暖光像黎明压进来',
    note: '2″ 蓄力，直接顶到 59.5 drop',
  },
  {
    id: 'S12', start: 59, end: 68, type: 'screen',
    placeholder: { name: '结晶蒙太奇（命门）', sub: '7 子拍真实落盘，1.5–3× 变速，7 个切点' },
    subs: [
      { at: 59.0, dur: 1.5, label: 'S12a 世界卡「灯烬纪」生长 1.5s' },
      { at: 60.5, dur: 1.5, label: 'S12b 模块逐个挂上（档案/规则/地理/时间线/势力/族群/文化/关系）1.5s' },
      { at: 62.0, dur: 1.5, label: 'S12c 创作模式写入回执：右侧对话工具调用回执与卡页模块正文同步落下 1.5s' },
      { at: 63.5, dur: 2.0, label: 'S12d 地图 · 生成人文层，国界城市落点 2.0s' },
      { at: 65.5, dur: 1.5, label: 'S12e 时间线五纪节点自左向右点亮 1.5s' },
      { at: 67.0, dur: 1.0, label: 'S12f 三角色卡依次出现，画像淡入 1.0s' },
      { at: 68.0, dur: 0.0, label: 'S12g 光向中心收束 0.5s 再散开，落定世界总览页' },
    ],
    push: { to: 1.0, dur: 9 },
    media: { kind: 'mix', segs: [
      // S12a 世界卡长出（主素材 t8–9.5）
      { from: 0, to: 1.5, src: 'assets/recordings/s12-build_1.mp4', in: 8.0, out: 9.5 },
      // S12b 模块挂上（主素材 t30–31.5 代）
      { from: 1.5, to: 3.0, src: 'assets/recordings/s12-build_1.mp4', in: 30.0, out: 31.5 },
      // S12c 创作模式写入回执（主素材 t45–46.5）
      { from: 3.0, to: 4.5, src: 'assets/recordings/s12-build_1.mp4', in: 45.0, out: 46.5 },
      // S12d 地图人文层闪切（大陆地图静帧代）
      { from: 4.5, to: 6.5, kind: 'still', src: 'assets/stills/s14-continent-map.png' },
      // S12e 时间线点亮（时间线静帧代）
      { from: 6.5, to: 8.0, kind: 'still', src: 'assets/stills/s16-timeline.png' },
      // S12f 三角色 banner 三连闪切
      { from: 8.0, to: 8.33, kind: 'still', src: 'assets/stills/s19-ayan.png', crop: { x: 0, y: 0.055, w: 1, h: 0.455 } },
      { from: 8.33, to: 8.66, kind: 'still', src: 'assets/stills/s20-chenqi.png', crop: { x: 0, y: 0.055, w: 1, h: 0.455 } },
      { from: 8.66, to: 9.0, kind: 'still', src: 'assets/stills/s21-xieshiyi.png', crop: { x: 0, y: 0.055, w: 1, h: 0.455 } },
    ] },
    flash: { at: 67.6, dur: 0.4 },
    cursor: [{ at: 62.7, x: 0.72, y: 0.3, click: true }],
    music: '00:59.5 drop（m2 起点 58.8，drop 瞬态压 59.5）+ 颂钵/钟声长延音 8s；星火颗粒音',
    sfx: [
      { name: 'drop', at: 59.5 },
      { name: 'bowl-bell', at: 62.7, dur: 8 },
      { name: 'sparkle', at: 59.5, dur: 8 },
      { name: 'ui-tap', at: 62.7 },
    ],
    camera: '蒙太奇快切为主；尾帧光收束 0.5s 再炸开落总览页；叠极轻星火颗粒（包装层余烬），不许加假 UI',
    note: '全片能量峰，单独精修；drop 压世界卡名字出现帧（±2 帧）',
    asset: 's12-crystal-montage/*.webm（a–g 七条）',
  },
  // ── 第三幕 · 巡礼 S13–S24（12 件，统一仪式：0.8″ 光痕 → 模块名 → 径向点亮 → 5–7s 缓推 → 暗下）──
  {
    id: 'S13', start: 68, end: 74, type: 'screen', pilgrimage: '世界总览',
    placeholder: { name: '巡礼① 世界总览', sub: '封面图（阿檐提灯远眺层叠灯城）＋金句「被光照见的，才存在过」＋规则/五纪/势力概览块' },
    push: { to: 1.04, dur: 6 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s13-world-overview.png' },
    music: 'pad+合唱氛围铺底（m3 进，68s 自然淡入）',
    sfx: [{ name: 'paper-rustle', at: 68.8 }],
    camera: '0.8″ 光痕 → 浮名 → 600ms 径向点亮 → 6s 缓推 100→104%',
    note: '巡礼第 1 件', asset: 's13-world-overview.webm',
  },
  {
    id: 'S14', start: 74, end: 81, type: 'screen', pilgrimage: '大陆地图',
    placeholder: { name: '巡礼② 大陆地图（亮区/暗区）', sub: 'FMG 真图；无主地深色、灯油泽州暖色、沉名故城半暗；六块地理与城市名中文可读' },
    push: { to: 1.04, dur: 7 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s14-continent-map.png' },
    music: '低沉大提琴长音进（74s，占位合成）',
    sfx: [{ name: 'paper-rustle', at: 74.8 }, { name: 'cello', at: 74.0, dur: 7 }],
    camera: '同仪式；7s 缓推', note: '巡礼第 2 件', asset: 's14-continent-map.webm',
  },
  {
    id: 'S15', start: 81, end: 88, type: 'screen', pilgrimage: '3D 灯烬世界',
    placeholder: { name: '巡礼③ 3D 灯烬世界（绕行长明京）', sub: 'three.js 同心圆环台地；窗光按距中心衰减，15% 边缘实例被黑暗吞蚀；圣火塔光柱+Bloom' },
    push: { to: 1.04, dur: 7 }, reveal: true, trace: true,
    media: { kind: 'video', segs: [
      { from: 0, to: 2, src: 'assets/recordings/s15-data-sphere_1.webm', in: 0, out: 2, crop: { x: 0, y: 0, w: 1, h: 0.95 } },
      { from: 2, to: 7, src: 'assets/recordings/s15-3d-world_1.webm', in: 0, out: 5, crop: { x: 0, y: 0, w: 0.93, h: 1 } },
    ] },
    music: '空气氛围+微弱风鸣（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 81.8 }, { name: 'wind', at: 81.0, dur: 7 }],
    camera: '镜头绕 3D 内容本身 30°/7″ 慢转（唯一允许的环绕），向圣火运动',
    note: '巡礼第 3 件；场景内真实粒子 60 粒不算包装层', asset: 's15-3d-world.webm',
  },
  {
    id: 'S16', start: 88, end: 94, type: 'screen', pilgrimage: '五纪时间线',
    placeholder: { name: '巡礼④ 五纪时间线（逐纪变暗）', sub: '有日纪→坠日纪→盗火纪→长灯纪→灯烬纪；灯烬纪节点是唯一活物点（绿，属产品 UI）' },
    push: { to: 1.04, dur: 6 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s16-timeline.png' },
    music: '一记远钟（89s，占位合成）',
    sfx: [{ name: 'paper-rustle', at: 88.8 }, { name: 'distant-bell', at: 89.0, dur: 4 }],
    camera: '同仪式；6s 缓推', note: '巡礼第 4 件', asset: 's16-timeline.webm',
  },
  {
    id: 'S17', start: 94, end: 100, type: 'screen', pilgrimage: '四方势力',
    placeholder: { name: '巡礼⑤ 四方势力', sub: '灯庭／拾烬者／慕暗者／铸灯行会；每卡一句话信条' },
    push: { to: 1.04, dur: 6 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s17-factions.png' },
    music: 'pad（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 94.8 }],
    camera: '同仪式；6s 缓推', note: '巡礼第 5 件', asset: 's17-factions.webm',
  },
  {
    id: 'S18', start: 100, end: 105, type: 'screen', pilgrimage: '三族群',
    placeholder: { name: '巡礼⑥ 三族群', sub: '常人／半蚀者／燃灵；每卡一句话' },
    push: { to: 1.04, dur: 5 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s18-peoples.png' },
    music: 'pad（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 100.8 }],
    camera: '同仪式；5s 缓推', note: '巡礼第 6 件', asset: 's18-peoples.webm',
  },
  {
    id: 'S19', start: 105, end: 111, type: 'screen', pilgrimage: '角色 · 阿檐',
    placeholder: { name: '巡礼⑦ 角色 · 阿檐（画像+金句）', sub: '少女灯史；金句「我写下的，就会有人记得。」' },
    push: { to: 1.04, dur: 6 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s19-ayan.png', crop: { x: 0, y: 0.055, w: 1, h: 0.455 } },
    music: '钢琴动机回来，柔（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 105.8 }],
    camera: '同一机位/构图/时长，三联祭坛画其一', note: '巡礼第 7 件', asset: 's19-ayan.webm',
  },
  {
    id: 'S20', start: 111, end: 116, type: 'screen', pilgrimage: '角色 · 沉七',
    placeholder: { name: '巡礼⑧ 角色 · 沉七', sub: '半身透明拾烬客；金句「我已经丢了半个名字，剩下半个，得省着用。」' },
    push: { to: 1.04, dur: 5 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s20-chenqi.png', crop: { x: 0, y: 0.055, w: 1, h: 0.455 } },
    music: '钢琴（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 111.8 }],
    camera: '同一机位；5s', note: '巡礼第 8 件', asset: 's20-chenqi.webm',
  },
  {
    id: 'S21', start: 116, end: 121, type: 'screen', pilgrimage: '角色 · 谢拾遗',
    placeholder: { name: '巡礼⑨ 角色 · 谢拾遗', sub: '灯庭年轻执事；金句「灯若不许灭，人就只配被照管。」钢琴转暗一个音' },
    push: { to: 1.04, dur: 5 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s21-xieshiyi.png', crop: { x: 0, y: 0.055, w: 1, h: 0.455 } },
    music: '钢琴，转暗一个音（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 116.8 }],
    camera: '同一机位；5s', note: '巡礼第 9 件', asset: 's21-xieshiyi.webm',
  },
  {
    id: 'S22', start: 121, end: 126, type: 'screen', pilgrimage: '燃术规则',
    placeholder: { name: '巡礼⑩ 燃术规则（富文本长卷）', sub: '含“代价表”：燃用一段记忆→身体透明度；排版精良' },
    push: { to: 1.04, dur: 5 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s22-ritual-rules.png' },
    music: 'pad（m3 内）',
    sfx: [{ name: 'paper-rustle', at: 121.8 }],
    camera: '同仪式；5s 缓推', note: '巡礼第 10 件', asset: 's22-ritual-rules.webm',
  },
  {
    id: 'S23', start: 126, end: 131, type: 'screen', pilgrimage: '残日灯 · 物品与画廊',
    placeholder: { name: '巡礼⑪ 残日灯 · 物品与画廊', sub: '物品卡＋画廊（残日灯概念图、灯芯碎片特写）' },
    push: { to: 1.04, dur: 5 }, reveal: true, trace: true,
    media: { kind: 'still', src: 'assets/stills/s23-sunlamp.png' },
    music: '一声金属轻鸣（占位合成）',
    sfx: [{ name: 'paper-rustle', at: 126.8 }, { name: 'metal-chime', at: 126.8, dur: 3 }],
    camera: '同仪式；5s 缓推', note: '巡礼第 11 件', asset: 's23-sunlamp.webm',
  },
  {
    id: 'S24', start: 131, end: 138, type: 'screen', pilgrimage: '自由 HTML · 光蚀地图',
    placeholder: { name: '巡礼⑫ 自由 HTML · 光蚀地图', sub: '虚拟光标走 长明京→千灯驿道→泽州灯油田→沉名故城；光到处黑暗褪去，离开 1.2s 后 0.6s 回暗；灯油细条渐尽' },
    push: { to: 1.04, dur: 7 }, reveal: true, trace: true,
    media: { kind: 'video', src: 'assets/recordings/s24-light-etch-map_1.webm', segs: [{ from: 0, to: 7, in: 0.2, out: 7.2, crop: { x: 0, y: 0, w: 0.93, h: 1 } }] },
    flash: { at: 137.6, dur: 0.4 },
    music: '火光“簌”+ 风（占位合成）；S24→S25 过曝',
    sfx: [{ name: 'paper-rustle', at: 131.8 }, { name: 'fire-brush', at: 131.5, dur: 6 }, { name: 'wind', at: 131.0, dur: 7 }],
    camera: '巡礼小高潮 7s；程序驱动光标自动行走；尾帧过曝转 S25',
    note: '巡礼第 12 件（凑齐 12 件）', asset: 's24-light-etch-map.webm',
  },
  // ── 第四幕 · 它是你的 ──
  {
    id: 'S25', start: 138, end: 146, type: 'screen',
    placeholder: { name: '同一会话新指令 → AI 真实写入 → 阿檐卡新段落长出', sub: '输入「再给阿檐补一段她在沉名故城的童年。」AI 直接写入，阿檐卡新段落真实长出——世界可以继续长' },
    push: { to: 1.02, dur: 8 },
    media: { kind: 'video', src: 'assets/recordings/s25-workbench_1.mp4', segs: [{ from: 0, to: 8, in: 10.0, out: 18.0 }] },
    music: '音乐收至钢琴单音（m4 起点 136.2，首音对齐 138.0）',
    sfx: [{ name: 'typing', at: 139.5, dur: 3.5 }],
    camera: '从陈列回到工作台全景；8s 缓推',
    note: '证明巡礼不是一锤子买卖', asset: 's25-workbench.webm',
  },
  {
    id: 'S26', start: 146, end: 153, type: 'screen',
    placeholder: { name: '内容树批量管理 · 多选/拖拽/批量操作', sub: '一个画面同时看见好看的渲染和像文件一样可靠的管理' },
    push: { to: 1.02, dur: 7 },
    media: { kind: 'video', src: 'assets/recordings/s26-tree-manage_1.mp4', segs: [{ from: 0, to: 7, in: 0, out: 4.03 }] },
    subtitle: { text: '好看，和井井有条，是同一个地方。', at: 147, dur: 5 },
    music: '轻柔 UI 音（m4 内）',
    sfx: [{ name: 'ui-tap', at: 148.0 }, { name: 'ui-tap', at: 150.0 }],
    camera: '静偏缓推；全片第二处标注字幕',
    note: '渲染即管理', asset: 's26-tree-manage.webm',
  },
  {
    id: 'S27', start: 153, end: 160, type: 'screen',
    placeholder: { name: '缓拉 · 内容树全景（左渲染+中树+右对话）', sub: '树里世界/地图/时间线/角色/文稿全部在列；小字「你聊过的每一句，都没有白聊。」停留 3s 随黑场淡出' },
    push: { to: 0.97, dur: 7, reverse: true },
    media: { kind: 'video', src: 'assets/recordings/s27-tree-pullback_1.mp4', segs: [{ from: 0, to: 7, in: 0.3, out: 7.3 }] },
    subtitle: { text: '你聊过的每一句，都没有白聊。', at: 153.5, dur: 6.5 },
    music: '钢琴尾音（m4 内）',
    sfx: [],
    camera: '反向缓拉（1.0→0.97），三列同框；小字停留 3s 后随黑场淡出',
    note: '第四幕收束', asset: 's27-tree-pullback.webm',
  },
  {
    id: 'S28', start: 160, end: 165, type: 'breath',
    placeholder: { name: '黑场 · 余烬向心收成一粒灯芯光', sub: '前面积累的余烬粒子从四面缓缓向心收拢，5s 收成开头那粒灯芯光——首尾闭环' },
    music: '余音，环境抽空（m4 尾段淡出）',
    sfx: [{ name: 'ambience-out', at: 160.0, dur: 5 }],
    camera: '静；粒子向心收拢',
    note: '落版前黑场 5s',
  },
  {
    id: 'S29', start: 165, end: 170, type: 'endcard',
    text: '聊出你的世界。',
    sub: '诺文 Noven',
    music: '静默 → 2:49.5 一声真实灯芯噼啪收尾（占位合成）',
    sfx: [{ name: 'crackle', at: 169.5 }],
    camera: 'slogan 字重 300 暖白；其下小字「诺文 Noven」；灯芯轻噼一声全黑',
    note: '落版；若有正式字标动效再用光描，没有就只打字标',
  },
];

/** 工具：按全局 t 取当前镜头（含越界保护） */
export function sceneAt(t) {
  const clamp = Math.max(0, Math.min(FILM_DURATION, t));
  for (const s of SCENES) {
    if (clamp >= s.start && clamp < s.end) return s;
  }
  return SCENES[SCENES.length - 1];
}

/** 时间码 mm:ss.d */
export function tc(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}
