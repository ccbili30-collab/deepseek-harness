# 录制规格与 ffprobe 台账

录制规范（新，强制）：真 Chromium headed + Metal（非 SwiftShader）；逻辑视口 1680×945、deviceScaleFactor=2。
动态镜头走 CDP `Page.startScreencast`（format png / everyNthFrame 1 / max 3360×1890）→ ffmpeg `-vsync cfr -r 60` libx264 `-crf 14` 输出 mp4；有效帧率 ≥50，精确 3360×1890（奇数高度不可接受）。
静止模块页（总览/势力/族群/规则/物品/角色卡）另出 dsf2 原生 PNG 静帧，缓推由舞台完成。
每条录完在此记录 ffprobe（width×height / fps / 时长 / 编码）。

## 已交付

| 镜头 | 文件 | 规格 | 备注 |
|---|---|---|---|
| S15 | s15-3d-world_1/_2/_3.webm | vp9 3360×1890 60fps 7.4s×3（确定性逐帧，Metal M4，见 s15-3d-world.fps.txt） | 3D 圣城；中/尾帧 stills/s15-3d-world-mid/-final.png |
| S15-sphere | s15-data-sphere_1/_2/_3.webm | vp9 3360×1890 60fps 7.0s×3（确定性逐帧，Metal M4） | S15 前 2 秒灯烬世界数据球；中/尾帧 stills/s15-data-sphere-mid/-final.png |
| S24 | s24-light-etch-map_1/_2/_3.webm | vp9 3360×1890 60fps 7.8s×3（确定性逐帧，Metal M4，见 s24-light-etch-map.fps.txt） | 光蚀地图巡礼；中/尾帧 stills/s24-light-etch-map-mid/-final.png |
| S13 | assets/stills/s13-world-overview.png | PNG 3360×1890 | 世界总览：封面 IMG-01（阿檐提灯远眺长明京）+ 金句「被光照见的，才存在过。」+ 总纲/Logline/标签，已核验 |
| S14 | assets/stills/s14-continent-map.png | PNG 3360×1890（画布全屏） | 大陆地图 FMG 深色海洋、国家层开启，四州纯中文名（长明京畿/泽州灯油田/无主边地/灯驿道东），画面无任何英文政体名，已核验 |
| S16 | assets/stills/s16-timeline.png | PNG 3360×1890 | 结构化时间线 5 纪元·25 事件；五纪背景已补、事件关系已绑定实体、灯烬纪绿色进行中，已核验 |
| S17 | assets/stills/s17-factions.png | PNG 3360×1890（dsf2 原生静帧，缓推由舞台做） | 势力·长明灯庭/拾烬者/慕暗者，已抽帧核验 |
| S18 | assets/stills/s18-peoples.png | PNG 3360×1890 | 种族/族群·常人/半蚀者/燃灵，已核验 |
| S19 | assets/stills/s19-ayan.png | PNG 3360×1890（画布全屏） | 角色卡·阿檐：竖版胸像裁成横版 banner（人脸居右三分之一）经「更换背景」设为 hero，身份标签「灯史」，头像渲染；金句「我写下的，就会有人记得。」在金句模块，已核验 |
| S20 | assets/stills/s20-chenqi.png | PNG 3360×1890（画布全屏） | 角色卡·沉七：横版 banner 作 hero、人脸居右三分之一，身份标签「拾烬客」，头像渲染；金句「我已经丢了半个名字，剩下半个，得省着用。」在金句模块，已核验 |
| S21 | assets/stills/s21-xieshiyi.png | PNG 3360×1890（画布全屏） | 角色卡·谢拾遗：横版 banner 作 hero、人脸居右三分之一，身份标签「灯庭执事」，头像渲染；金句「灯若不许灭，人就只配被照管。」在金句模块，已核验 |
| S22 | assets/stills/s22-ritual-rules.png | PNG 3360×1890（画布全屏） | 规则模块，代价阶梯已转三列表格，已核验 |
| S23 | assets/stills/s23-sunlamp.png | PNG 3360×1890（画布全屏） | 物品·残日灯灯体图满幅渲染；独立画廊模块图块受 doc 渲染限制未出图，见文末说明，已核验 |
## M4 产品 UI（CDP `Page.startScreencast` 真实时间轴，非确定性逐帧）

渲染器（`WEBGL_debug_renderer_info`）：`ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`；headed 本机正式版 Chrome + `--use-angle=metal --ignore-gpu-blocklist --enable-gpu-rasterization`；逻辑 1680×945、dsf=2 → 3360×1890；CDP 帧按 `metadata.timestamp` 铺 ffconcat，`-r 60 -vsync cfr` libx264 crf14 yuv420p；ffprobe 恒定 60/1。

| 镜头 | 文件 | 规格（3360×1890 / 60fps / x264） | 时长 | 内容 |
|---|---|---|---|---|
| S03 | s03-seed-transition_1/_2/_3.mp4 | 3360×1890 60fps | 24.517 / 21.284 / 33.634s | 首页种子句→发送→仪式转场→首答 |
| S04 | s04-option-select_1/_2/_3.mp4 | 3360×1890 60fps | 7.884 / 7.800 / 7.484s | 问答卡点选选项2，选中态定格未提交 |
| S05 | s05-rule_1/_2/_3.mp4 | 3360×1890 60fps | 33.834 / 32.717 / 28.717s | R3 黑透除名规则轮 |
| S06 | s06-ritual_1/_2/_3.mp4 | 3360×1890 60fps | 31.367 / 26.717 / 29.084s | R6 燃术半蚀轮 |
| S07 | s07-lamp-history_1/_2/_3.mp4 | 3360×1890 60fps | 33.834 / 33.834 / 30.167s | R5 灯史轮 |
| S08 | s08-factions-roles_1/_2/_3.mp4 | 3360×1890 60fps | 37.917 / 27.684 / 28.234s | R8 四方势力+三角色轮 |
| S09 | s09-seat-switch_1/_2/_3.mp4 | 3360×1890 60fps | 8.400 / 8.684 / 8.834s | 首页 seat 探索模式→创作模式真实切换 |
| S10 | s10-one-sentence_1/_2/_3.mp4 | 3360×1890 60fps | 9.284 / 9.234 / 9.284s | 逐字「挺好，就按这个，帮我全部建出来吧。」+绿色发送钮+开始分析（创作模式 Enter 仅排队，须点发送钮） |
| S12 | s12-build_1.mp4（主素材） | 3360×1890 60fps | 55.234s | 实时建卡：t≈8–30s 新空卡出现（S12a 可切），t≈45–55s 工具回执「已调用工具/卡改回来了」（S12c 可切）；S12b 模块连续挂载/S12d 地图人文层/S12e 时间线点亮/S12f 角色卡未单独实时捕获，待补 |
| S25 | s25-workbench_1.mp4 | 3360×1890 60fps | 31.917s | 「再给阿檐补一段她在沉名故城的童年。」→人物集合新开「童年」栏写入三段，回执已保存（单条最佳，重发会重复写段故未录 2/3） |
| S26 | s26-tree-manage_1.mp4 | 3360×1890 60fps | 4.034s | Meta 多选 2 张录制卡→选择栏「隐藏」批量隐藏；复原在录制外完成，未碰成品卡 |
| S27 | s27-tree-pullback_1.mp4 | 3360×1890 60fps | 7.767s | 三栏同框（左会话列/中对话/右成品世界卡页+成品树），缓滚轮收住 |

抽帧 PNG：`_制作/录屏/m4-frames/<slug>_<n>.png`。

> 静止页用 dsf2 原生 PNG（非视频），故无 ffprobe 帧率；像素尺寸 3360×1890 已逐张用 PNG IHDR 核验。动态镜头走 CDP 管线，录完在此补 ffprobe。

## 隔离作废（recordVideo 固有 25fps / 1680×944 / VP8，不合规格）

- 位置：`_rejected-recordVideo/`（s13/s14/s16/s17/s18/s20/s22/s23）。原因：Playwright recordVideo 固定 25fps、仅录 1× 视口，非 dsf2 3360×1890、非 60fps，全部作废，待按 CDP 管线重录。

## 待录（按 CDP 管线）

- S03–S10 探索段；S12 树生长/挂载/地图人文层/时间线点亮/角色卡（S12c 改拍回执，不拍接受动作）；S13 世界概述（封面+金句「被光照见的，才存在过」+概览块，需先真实写入配置）；S14/S16/S17/S18/S20/S22/S23 重录；S19 阿檐、S21 谢拾遗；S25 录制副本长出阿檐童年；S26 树管理；S27 全景。（S15/S15-sphere/S24 已由 M3 agent 交付）

## 第二轮静帧重拍（画布全屏构图）

10 张静帧已按「画布全屏（↗）铺满、收起内容树与会话栏」重拍并同名覆盖，均为 dsf2 原生 3360×1890 PNG：s13/s14/s16/s17/s18/s19/s20/s21/s22/s23。构图核验：画面无右侧空白区、无内容树、无对话栏，仅留极简页签条与 ↗。

## 第三轮（M2 精修）改动与遗留

本轮通过产品真实能力（UI「更换背景」文件选择器上传、「＋加标签」、FMG applyOperations 改名、画布全屏）完成，未手改卡片文件、未改产品源码。

- S19/S20/S21：三张角色胸像经 hero「更换背景」上传为封面满幅；身份经「＋加标签」写入（阿檐=灯史、沉七=拾烬客、谢拾遗=灯庭执事）；头像均正常渲染；三张首屏同构图（封面满幅 + 头像 + 身份标签 + 模块瓦片）。宣传片金句原文已在各自「金句」模块。
- S14：四州显示名经 FMG `States.setFullName` 改为纯中文（长明京畿/泽州灯油田/无主边地/千灯驿道东线），原 `Theocracy`/`Principality of …` 英文政体名已从渲染移除；海洋呈深青灰底色；画布全屏。
- 10 张全部重新以「画布全屏」拍摄，单页签、无侧栏、无对话，尺寸 3360×1890（sips 逐张核验）。

遗留（产品侧限制，非数据损坏）：
1. 金句模块提为首位：`move_module` 的上移/下移入口仅在 CardStudio 模块行右键菜单，本导航路径无法到达；REST 直发因服务端草稿由客户端会话持有而返回「草稿不存在」。金句内容本身已正确写入金句模块，仅排序未置顶。
2. S14 城市标签：FMG Burgs 标签层（burgLabels/burgIcons）勾选后不随地图保存，`Styles.setValue` 被 ALLOWED_OPERATION 拒绝；本版仅 4 个州多边形，白夜冰架/不归黑海/无主地无多边形可涂。故默认视图不显示 16 个中文城名，海洋配色亦不可持久化（录制时可在同会话临时开启再即拍）。
3. 独立画廊模块（81b68cdf）4 张图资源文件均有效（/api/file 200、合法 PNG、1.3–2.1MB），但普通 doc 模块经 BlockNote 渲染时无法解析 `card-image:<res>#<block>` 为真实 URL，`<img>` naturalWidth=0；需产品侧图片 widget 绑定，本任务不改源码。S23 拍的是物品模块，残日灯灯体图正常满幅渲染。

## 第四轮（封面裁切 + S14 国家层）

- S19/S20/S21：竖版胸像先用 Pillow 裁成约 4:1 横版 banner（人脸居中偏右、下巴完整），存于 `视觉/<名>-胸像-banner.png`，再经 hero「更换背景」重新上传；三张人脸落在横条右三分之一、构图一致；身份标签保留。
- S14：经 `States.setForm(id,"")` 清空政体名并 `States.setFullName(id,中文)` 重建，持久化（save + noven-map-save）；拍摄同会话开启「国家」覆盖层、深色海洋、适应、关闭选择弹窗，画面仅中文四州名，无任何英文。国家层开关本身不持久化，属会话内真实渲染。
