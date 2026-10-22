# 工作台与创作库

两个互补的成果出口：**工作台**管"目录和文件的展示"，**创作库**管"作品的登记与阶段"。文件本体都在项目目录里，注册的只是索引。

## 工作台（侧栏成果区）

侧栏工作台区第一项永远是**文件**——整个项目树，不可注销，什么都不注册也能翻到全部产出。注册的工作台排在它后面。

```
register_workbench { folder, title, home? }   → 注册（目录变成侧栏可点开的书架）
set_workbench_home { id, path }               → 打开工作台先显示的文件（首页，通常一个 HTML）
show_in_workbench { id, path }                → 置顶 + 即时把该文件摆上画布（一次性呈现）
set_workbench_visibility { id, include?, exclude?, autoIncludeNewFiles? } → 文件可见范围
set_file_view { id, path, frame? }            → 给文件绑定画框（留空解除）
rename_workbench / unregister_workbench
```

### 注册 = 交付声明，不是登记

工作台是**交付书架**，不是文件索引——文件兜底已经保证什么都找得到，注册是你说"这批东西值得认真看"。只在两种情况注册：

- **用户点名**：他说注册什么就注册什么
- **你做出了有意义的成品**：一大批正文小说整理成可读的章节结构、完成的交互地图 HTML——注册前先替用户做好分类布局，让它值得被认真观看

普通的中间产物、过程文件、单个小文件**不要注册**——它们在文件兜底里本来就找得到。注册一堆零碎工作台只会让书架变成垃圾场。

### 画布视图

点文件行 → 画布按类型选内胆：Markdown/文本 → 渲染 + **编辑**（编辑态直接改文件，外部改动会冲突提示不覆盖）、图片 → 预览 + 批注、带 `map-manifest.json` 的目录 → 交互地图、其余 HTML → 沙箱页面。

## 画框（HTML 渲染层）

画框是一个 HTML/CSS/JS 程序，**活体**覆盖在源文件上：渲染时经 `NOVEN_FRAME.loadSource()` 读源文件，源文件更新画面即更新，不存在"过期"。两种用法：

- **`set_file_view`**：把工作台里一个 `.md` 绑定到画框 HTML，画布打开该文件时显示画框而不是纯文字。用户要编辑时切回源视图。
- **`present_artifact { frame, source, title? }`**：把一帧渲染内容呈进**对话流**——将军递战报、海报、地图这类"戏内实物"就用它。对话里出现内嵌渲染区块，可点开进画布。

画框文件本身也在项目里（比如 `战报/frame.html`），是你写的小前端；写好一次可以反复框不同数据。**独立可交互作品优先做成卡里的自由界面/自由 3D 模块**（`help({topic:"surfaces"})`），画框只用于给已有文件套渲染层。

## 创作库（作品登记）

登记过的文件才会出现在创作库：

```
register_work { file, title, kind }    → 登记作品（kind: 文/图/设定集…）
set_work_stage { id, stage }           → draft 草稿 / final 定稿 / published 已发布
add_work_revision { id, file }         → 追加历史版本（折叠在详情里）
archive_work { id }                    → 归档（默认隐藏，不删文件）
list_library                           → 全部登记作品 + 未登记的收件箱文件
```

`list_library` 会把**没登记的文件**也列出来当收件箱——产物写了忘登记是常态，先查它。

## 图片进文档

`attach_image_to_document { image, document, anchor? }`：把项目里的图片以 Markdown 引用插进文档（默认文末，给 anchor 插到该标题后）。生图之后顺手插图，文档就活了。

## 边界

- 注册表/登记数据在应用账本 `~/.noven/ledger/`——**永远别手改**，用上面的工具
- 注销工作台、归档作品都不删文件；文件是用户的
- 画框 iframe 是沙箱（只读、无外网），它写不了文件——写文件走普通文件工具
