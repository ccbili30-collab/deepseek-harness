---
name: creation-toolbox
version: 1.0.0
description: 创作模式动手前必读的工具手册。覆盖建卡、模块、文字块、集合、时间线、关系图、地图、自由界面/3D、图片、内部角色、项目迁移、文件命令与子代理，写清每类工具的调用顺序、前置读取、常见坑与验收动作。用户要求建卡、写模块、改文稿、做界面、生图、跑命令时先读本技能。
---

# 创作工具箱

你不是在操作一堆参数，你是在替用户保管作品。所有工具都遵守同一句话：**改前先读，写完回读，失败不谎报。**

## 通用纪律

1. **改前先读。** 卡用 `read_card`，集合用 `collection_describe`，时间线用 `timeline_describe`，关系图用 `relation_describe`，地图用 `map_describe`，自由界面用 `surface_read`，文字块用 `read_text_block`。
2. **专用工具优先。** 集合、时间线、地图、关系图都有专用工具；不要手写 JSON 塞进 `widget_set_data`，除非该模块只有它。
3. **写完回读。** 写卡后 `read_card` 校验结构；写文字后 `read_text_block` 校验正文；做界面后 `surface_validate` + `surface_diagnostics`。
4. **失败不宣称完成。** 只有工具返回 `saved` / `ok` 才算落盘；报错就如实说，不换路径绕开。
5. **跨项目要指明。** 所有卡工具都有 `project` 参数（项目名/编号/目录）；省略时只在本会话项目找。跨项目先 `list_projects`。
6. **不确定就查。** `help({ topic })` 读内置手册（cards / creation / surfaces / workbench / projects / sidecar / troubleshooting）；参数以工具 schema 为准，不猜。

## 一、卡与模块

### 新建整卡

- 标准世界卡 / 角色卡：`list_card_presets` → `create_card_from_preset`。模板自带模块树、字段、时间线与呈现契约，不要在它上面再猜标准模块。
- 只要一张空壳：`create_card`，只接受 `kind`（WORLD/CHARACTER）和 `name`；空卡不代表正文完成。
- 一次成型文档树：`create_card_bulk`（`modules_json`，每项 `{name, text, routing, temporality, children}`，最多四层）。整包校验，任何节点不合法都不写入。
- 往已有卡插整棵文档子树：`add_module_bulk`（`module_json`，`before_id` 省略=根末尾）。只支持文档模块。

### 读卡

`read_card` 给模块结构、编辑版本、修改来源，**不读全部正文**。改卡前必读；跨项目卡照常读，`project` 显式指定。世界内角色用其编号作 `target_id`。正文用 `read_text_block` 分页读。

### 加模块

- 文本/文档：`add_module`。需要可交互界面、游戏、图表或 3D 时**不要**先落空文档模块。
- 内置预设：`add_module_preset`（规则/语录/势力/种族/文化/能力/装备/图鉴/时间线/地图/自由界面 `surface`/自由 3D `free3d`，以及 dashboard/gallery/viewer 模板）。先用 `list_module_presets` 取 id。预设自带字段、默认视图、呈现契约和样例，**不要再用集合工具重复补字段**。
- 声明式自定义：`add_module_custom`（可直接带 presentation/字段/视图/labels）。复用项目里已保存的定义：`list_user_modules` 读，再落卡。
- 子模块：`add_child_module`（真实子模块，可独立打开/移动；不要用正文标题冒充子模块）。
- 引用模块：`add_module_ref`（把另一张卡或同卡的模块只读挂过来，可带 view/filter/overrides）。先 `read_card` 取 source_card_id/source_module_id。
- 只改模块名/标签/携带规则：`rename_module` / `set_module_options`（rule kind：automatic / always / manual / keywords，keywords 要 words、case_sensitive、require_all）。
- 移动：`move_module`（同父级换位）、`place_module`（换父级，禁止放进自己或后代）。
- 删除：`remove_module`（连同子模块与内容块）、`remove_content_block`。

### 写文字块

- **整块新建或完整替换：** `write_module_text`。新建时 `block_id` 传空（`new` 等占位词也按新建）。**不要把读到的一页当全文覆盖**——分页读到的只是片段。
- **局部替换：** `replace_text_range`。先 `read_text_block` 拿 `content_ref`，原样传回；范围按万国码码点，左闭右开；插入时 start=end，删除时 text 为空。
- **整模块 Markdown 替换：** `write_module_markdown`，保留子模块/布局/编号/标签。只有掌握全部正文时用。
- 图片说明：`write_image_caption`。图片替换：`replace_block_image`。
- 写完必回读 `read_text_block`；跨页内容确认 `has_more` 为假。

标准序列：

```
read_card → read_text_block(content_ref, offset, limit)
→ replace_text_range(content_ref, start, end, text)
→ read_text_block 回读
```

### 世界内角色

- `create_internal_character`（返回新角色编号）、`remove_internal_character`（历史保留）、`place_internal_character`（模块位置，空=独立列表）、`copy_internal_character`（跨项目复制整只角色）。

## 二、集合

- 先 `collection_describe`：字段、条目、每格值、默认视图、呈现契约、source。`item_id` 省略返回全部。
- 字段类型：`text` / `longtext` / `date` / `person`（角色引用）/ `image`（resourceId）/ `place`（世界卡引用）/ `number`（图表/体量）/ `time`（数值时间，与时间线同轴）。
- 条目：`collection_add_item`（专用工具；`values` 一次写齐）、`collection_update_item`、`collection_remove_item`。
- 字段：`collection_add_field` / `collection_update_field` / `collection_remove_field`。
- 值：`collection_set_value`；文本传带引号 JSON 字符串，图片传 `{"resourceId":...}`，person/place 传 `{"cardId":"...","name":"..."}`。
- 配图：`collection_set_item_image`（卡内已有资源）、`collection_set_style`（统一画风提示词，生图时拼在每条描述前）。
- 视图：`collection_set_view`：`list` 表格 / `cards` 图鉴卡 / `timeline` 编年长卷 / `map` 预留。

## 三、时间线

- 先 `timeline_describe`：历法、视图、事件（含编号）、时代、刻度标记。`view=diary` 是纵向日记。
- 事件：`timeline_add_event`（`at` 数值时间，省略/null=存在但未上轴；`until` 给则是一段时期）、`timeline_update_event`（只传要改的字段；color 空串=跟随纪元）、`timeline_move_event`、`timeline_remove_event`。
- 时代：`timeline_add_era` / `timeline_update_era` / `timeline_remove_era`；`from`/`to` 传 null 表示开放端（向过去/未来延伸）。
- 刻度：`timeline_add_mark` / `timeline_update_mark` / `timeline_remove_mark`（如「现在」「转折点」）。
- 历法视图：`timeline_set_calendar` 存命名视图，`timeline_switch_view` 只换显示不动数据。

## 四、关系图与地图

- 关系图：`relation_describe` 读节点/连线/位置/标签 → 整体写回用 `widget_set_data`。
- 地图：`map_describe` 读解析后的实体表（国家/城邦/河流/地貌/文化，归一化位置、人口、都城等，已套用 edits 覆写）→ `widget_set_data` 整体写回。
- 局部取景：`map_spawn_view` 从 map 生成局部视图子模块（取景框内对象重归一化）。

## 五、自由界面与自由 3D

- 建：`add_module_preset` 的 `surface`（自由界面）、`free3d`（自由 3D）或 `free3d.editor`（可编辑 3D：基础几何 + 网格编辑，场景存进卡）。不要先建空模块再手写整段 HTML。
- 读：`surface_read`（entry、manifest、文件清单、字节、静态校验、`state_version`/`state_bytes`；给 path 回文件正文和 `content_ref`；`include_state:true` 才回 `state` 正文）。改前先读。
- 写：`surface_write_file`（新建/覆盖单个文件，可带子目录；相对 import 用 `./`）。按文件改，不要整包重写 JSON。删除/改名：`surface_delete_file` / `surface_rename_file`。manifest：`surface_set_manifest`。
- 状态：`free3d.editor` 的场景在工程 `state` 里，由编辑器通过 `surface_set_state` 保存；AI 先 `surface_read` 读它，不要用 `write_text` 整包重写。改外观、交互和默认场景逻辑改 `main.js` / `style.css`。
- 验：`surface_validate`（静态：entry、越界、字节上限、import 落点）→ `surface_diagnostics`（运行时控制台/报错，页面打开时上报）。没有日志通常表示页面还没被打开过。
- 旧原始 HTML 模块：`surface_init` 迁移成工程（index.html + manifest），再按文件改。
- 模块内跳转用 `NOVEN_FRAME.openCard / openModule / navigate`。

## 六、图片

- 看卡上的图：`read_card_image` 返回绝对路径，再用平台 `read_image` 真正查看。资源目录里有图≠你看过。
- 生图：用图片工具（gen-image / noven-image），不要拿文字声明代替。
- 入卡：`save_conversation_image`（项目内图片复制进卡；`module_id` 空=只存资源，`after_id` 空=模块末尾）、`insert_owned_image`（复用卡内已有资源插入图片块）。
- 封面/头像：`set_card_image`（素材须已在卡内）、`clear_card_image`。
- 替换/移除：`replace_block_image`（保留块编号/位置/图注）、`remove_card_resource`（`remove_uses` 决定是否连带展示）。

## 七、项目与迁移

- `list_projects`（名称/编号/目录/卡数）、`list_cards`（卡类、名称、修订、草稿状态）。
- `move_card`：整卡搬项目（编号/内容/修订/草稿随行，挂载引用不失效）。
- `export_card`：导出 `.novex.zip`；有未提交草稿时拒绝。
- `import_card` / `commit_import`：导入交换包/外来文件并确认。

## 八、文件、命令与子代理

- 文件：`read` / `write` / `edit` / `glob` / `grep`。项目内相对路径；不要用 shell 改卡（卡要走卡工具）。
- 命令：`bash`（Windows `pwsh`）。先看清楚再跑；破坏性命令先说明；长输出自己截取。
- 子代理：`subagent`（新建，spawn）与 `subagent_fork`（沿当前上下文分叉）。委派时把任务、边界、交付物一次说清；收结果后自己核验，不把判断权交给子代理。用户的创作决定不委派。

## 九、开工前的固定顺序

1. `read_card`（或对应 `*_describe`）确认现状；
2. 看任务属于哪类：卡/文稿/界面/图/账——选对应专用工具；
3. 按上面的标准序列执行；
4. 回读/校验；
5. 用用户能懂的话汇报做了什么、哪些没做、下一步。
