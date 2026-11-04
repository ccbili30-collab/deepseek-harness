# Noven shell

[English](README.md) | 中文

Noven 壳通过插件注册页面、画布和对话内联模块。`chatBlocks` 与 `inputTriggers` 分别注入；任一服务晚于壳出现时，其注册仍会生效。内联模块不等待可选的输入触发服务。

卡片背景只使用封面，世界身份图只使用 Logo，角色身份图只使用头像。旧 Host 未返回 Logo 时显示对象占位符。页签滚动和标题字号由卡片页样式负责，图像的位置不移动标题或元信息。

Host 与 Client 分别用 `tsc -p tsconfig.host.json` 和 `tsc -p tsconfig.json` 构建；浏览器包由本包 `tsdown` 配置生成。内联回归位于 `tests/inline-modules.spec.ts`，图片职责回归位于 `tests/card-images.spec.ts`，样式守卫为 `node tests/mode-style.mjs`。

文本编辑器共享保存缓冲：自动保存关闭时，关闭视图会丢弃手动草稿且不写盘；自动保存开启时关闭前提交残余输入。失败保留草稿，确认旧提交不清除新输入。整模块写入携带 `expectedText`，卡片 Host 比较存储正文并返回 `savedText`，客户端据此确认解析后的 Markdown。此保护要求同版 `noven-cards` 与 `noven-shell` 一起安装。

页签、预览、引用模块和对话内联模块共享卡片快照。旧请求晚到不覆盖已接受的读写或删除；项目地址完整参与缓存键。只有 HTTP 404 表示缺失，其他读取失败保留已有内容并作为错误返回。命令失败不会关闭删除对象的页签或预览。`tests/save-cache.spec.ts` 与 `tests/save-entry.client.spec.ts` 验证失败、关闭、手动取消和切换路径。

持久格式保持不变：旧卡、会话和设置字段保持原样。回滚客户端只改变缓存和保存时机；已保存的 Markdown 仍由旧解析器读取。共享 `SettingsFormModel` 的确认修复随桌面运行时构建发布，独立插件不能靠源码链接替换已安装的共享包。

Noven 设置注册提供可选 metadata，同时保留当前齿轮图标与顺序。[共享设置兼容要求](../../packages/client/ui-settings-general/README.zh.md#ledger-projections)定义核心、渲染器和设置包的配套发布单元。支持 metadata 的插件遇到旧核心时仍按旧导航注册。Noven 的其他必需服务（包括 `canvasPages`）仍须匹配运行时；缺失必需提供方会阻止激活。本插件直接消费渲染器的 `canvasPages` 声明。

构建共享包、Session Controller、store/util 库、ledger 和 fmg 后，在仓库根运行 `node plugins-noven/noven-shell/tests/packed-runtime.mjs`。它打包实际 `files` 载荷，在隔离消费者内安装并检查包路径仅落在该安装内，使用已安装声明构建两个 Noven 客户端，解析真实 factory，验证 Cordis 注册与卸载，并检查已发布 rc.2 核心对 metadata 的回退。候选包只是暂存验收输入，不是对已发布 rc.2 的替换。此 smoke 不替代桌面或完整 Loader 验收。
