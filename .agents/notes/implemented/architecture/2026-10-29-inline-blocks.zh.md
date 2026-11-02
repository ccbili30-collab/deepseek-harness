# Agent Note: 内联块——明确内容归属，而不是逐处修补

Status: implemented

[English](2026-10-29-inline-blocks.md) | 中文

## Problem

assistant 正文需要在准确阅读位置承载富内容，但工具结果产物只能出现在轮次末尾。早期内联方案还会随流式 chunk 重建内容、重置滚动、保存全局激活态，并分别补偿迟到布局。Noven 最初的 `code` 又把轻量消息内容误当成持久 HTML 产物，与已有 HTML 模块职责重复，还留下需要清理的文件。

## Decision

内联块是由四条不变量约束的封闭单元：

1. **只追加的封闭单元。** 一整行 `::view{...}` 必须包含完整 JSON、块 id 和恰好一个内容字段。分段按源偏移取键，流式追加不会移动或重建前面的块。
2. **明确内容归属。** `src` 引用已有对象；`data` 把带版本的组件文档保存在 assistant 消息里。引用渲染器收到解析后的来源；数据渲染器收到验证后的 JSON、稳定的 Turn/step/文本块/偏移身份、工作区媒体解析和可选的当前会话提交回调。轻量 code 不创建文件、卡片、iframe 或模块。
3. **激活就是焦点。** 框架使用焦点与 `:focus-within`，Esc 释放。没有激活块存储，也没有文档级键盘路由器。
4. **尺寸服从内容。** 引用块在加载与失败期间都保留声明比例。已封闭的组件文档使用自然高度，媒体与图表管理各自的内部几何。

语法不认识组件，注册表区分引用与数据规格但不认识消息，并发布版本通知：晚注册、注销和来源解析器变化都会刷新已挂载内容，解析失败不会进入类型渲染器。Noven 拥有组件目录和验证。共享目录同时服务系统提示与契约 fixture。二十个组件覆盖组合、媒体、OC 叙事、协作和轻量数据表达；校验只允许各组件声明的字段并要求可选 id 唯一，模型不能借附加字段偷渡 HTML、CSS、脚本、SVG 源码、任意样式或 base64 媒体。

选择复用当前会话现有输入区。稳定的块/组前缀追加或替换一枚引用 chip，输入触发器 codec 把选中值序列化成普通文字，失败恢复沿用现有输入生命周期。查看和点击不同步模型状态。

## Alternatives considered

- **轮次末尾产物。** 无法表达两段正文之间的位置。
- **文件式 HTML code。** 会制造重复 HTML 模块和清理负担，还会让模型反复重写表现代码，而不是复用稳定组件。
- **持续状态同步。** 增加缓存与日志义务，却不改善用户需要的交互；只有确认的选择需要成为用户文字。
- **第二套待选择存储。** 会重复输入区已有的草稿持久化、版本检查、序列化和失败恢复。

## Verification

`packages/client/ui-chat/tests/inline-blocks.client.spec.tsx` 与 `block-commit.client.spec.ts` 覆盖引用/数据封闭解析、混合内容拒绝、自然高度、稳定身份、来源失败、注册表注册/注销刷新、媒体解析、提交转发和追加/替换坐标。`apply-inject.client.spec.tsx` 覆盖真实 Chat/Conversation 组装下的选择插入与替换。Noven 独立 inline-code 套件验证并渲染目录内每个组件，同时覆盖文本消毒、无效负载、未声明或重复字段、选择引用往返和无提交能力时禁用。模块套件覆盖卡片来源与选择 codec 注册，以及 display-only 地图保存。`apps/web/tests/noven-inline-code.e2e.ts` 另有真实浏览器测试，覆盖全部组件族、真实图片加载、深浅色与窄屏、历史重渲染、选择替换与追加、普通文字提交、工作区文件不变及侧车感知退出。`apps/web/tests/noven-inline-gallery.e2e.ts` 改为等待内联产品链真正保存地形摘要、地形文档和人文世界，再检查 request 清除和刷新重载；`generate_map` 直接生成同样走通。新增 keyless 录制快照 `snapshots/web/noven-inline-blocks`：提交 V4 会话日志、刷新 `ui.expected.md`、无密钥 replay，并证明同一消息的两个文本块各自保留 chip、完整组件目录仍渲染；快照 corpus adapter 清单已登记。ui-chat 与 noven-shell 客户端/宿主类型检查、Noven 生产构建和全仓构建通过。

## Consequences

Noven 注册消息内组件文档 `code` 和现有卡片模块 `module`。旧文件式 `CodeBlock`、frame 解析器、HTML 提示和图表 HTML 模板已从这条路径移除。共享卡片 `ModuleSurface` 继续只读，唯一例外是被引地图在一次已消费生成请求期间，只接受该地图自己的 terrain/world 保存。组件注册表尚未挂载画布或独立预览。二十种 code 组件与十类模块预设的隔离 Web 视觉和交互验收已通过；由于验收环境没有模型凭据，真实模型回合仍未验证。
