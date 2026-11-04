# Noven shell

Noven 壳通过插件注册页面、画布和对话内联模块。`chatBlocks` 与 `inputTriggers` 分别注入；任一服务晚于壳出现时，其注册仍会生效。内联模块不等待可选的输入触发服务。

卡片背景只使用封面，世界身份图只使用 Logo，角色身份图只使用头像。旧 Host 未返回 Logo 时显示对象占位符。页签滚动和标题字号由卡片页样式负责，图像的位置不移动标题或元信息。

Host 与 Client 分别用 `tsc -p tsconfig.host.json` 和 `tsc -p tsconfig.json` 构建；浏览器包由本包 `tsdown` 配置生成。内联回归位于 `tests/inline-modules.spec.ts`，图片职责回归位于 `tests/card-images.spec.ts`，样式守卫为 `node tests/mode-style.mjs`。
