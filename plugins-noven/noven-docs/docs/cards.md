# 制卡工作流

## 卡是什么

一张卡 = `卡/<卡名>/` 一个目录：

```
卡/<卡名>/
  card.json      # 卡文档：编号、名字、模块树、资源、世界内角色
  draft.json     # 未提交的草稿（只在你保存过草稿时存在）
  contents/      # 正文与图片载荷（按内容寻址）
  revisions/     # 历史版本 r1.json、r2.json……
```

- **卡编号是身份，目录名只是投影**——用户在 Finder 里给目录改名，卡还是那张卡
- 两种卡类：世界卡（WORLD，可含世界内角色）和角色卡（CHARACTER）
- 模块树：每个模块有标题、正文块（text）、子模块，可带 `routing`/`temporality`/`per_turn`/`style` 等配置——bulk 建卡时直接带上就生效

## 建卡：宏通道优先

```
create_card_bulk { name, kind, modules_json }
```

一次调用整卡落地（模块树 + 正文 + 配置），失败不会留半张卡。成功回执里有 `next_draft_version`。

次选路径：`create_card` 建空卡 → `add_module_bulk` 逐棵补子树。只在需要分步决策时用。

## 改卡：直接落盘，不用接力版本号

```
read_card { root_id }                    → 返回结构 + 当前版本
add_module_bulk / write_module_text …    → 回执：status "saved" + next_draft_version
```

- **AI 的写入直接提交到 `card.json`**：没有提案、没有信任档、不需要用户确认。回执 `status: "saved"` 就是已经生效，可以如实告诉用户完成了。
- 旧版 `proposal.json` / `aiTrust` 已经废弃；不要再向用户提提案、接受/拒绝或信任档。
- 写操作**总是套用到最新内容**；`draft_version` 可以省略。只有你读取后被改过的**同一个文字块**会被拒（提示重新读取）
- 想保护一个文字块：局部修改用 `replace_text_range`（带 `content_ref`）；整块替换时给 `write_module_text` 也传 `content_ref`
- 正文太长时用 `read_text_block` 分页读；图片资源用 `read_card_image`

## 预制模块：用专用工具，别手写 JSON

时间线 / 集合模块的内部数据是版本化 JSON（`contents/` 里的 widget 载荷），一律用专用工具改：

- 时间线：`timeline_add_event` / `timeline_update_event` / `timeline_move_event` / `timeline_remove_event` / `timeline_add_era` / `timeline_update_era` / `timeline_remove_era` / `timeline_set_calendar`（历法的 `step` 是拖动吸附步长，用户可自己调精度）
- 集合：`collection_add_field` / `collection_update_field` / `collection_remove_field` / `collection_add_item` / `collection_update_item` / `collection_remove_item` / `collection_set_value` / `collection_set_view`

时间取**数字**，显示靠历法模板；未放置的事件 `at` 省略即可。旧版 `nodes`/`items` 投影由编码时自动重算，不用你维护。

## 自由界面 / 自由 3D：优先于写文件

要做可交互的东西——界面、游戏、3D、图表、小工具——默认建卡 + `surface`（自由界面）或 `free3d`（自由 3D）模块，在画布里直接渲染。工程是 `entry + files + manifest`，用 `surface_read` / `surface_write_file` 按文件改，`surface_validate` 静态校验，`surface_diagnostics` 读运行日志。完整桥、three.js、限制和文件退路见 `help({ topic: "surfaces" })`。

只有沙箱做不了（项目二进制资产、外网、未内置库、必须被其他工具消费）才写文件；写完用 `module_embed_file` 挂回卡里。

## 跨项目的卡

`list_cards` 只列本会话项目的卡库。其他项目的卡：

- 挂载引用卡：`mounted` 清单里有，`read_card` 直接读（`project_root`/`card_dir` 都在回执里），**也能直接改**——改的就是来源项目
- 完全未知项目：`list_projects` 看有哪些项目 → 任何卡工具加 `project` 参数（项目名/编号/路径都行）→ 或者不传让工具自动全项目找
- `move_card` 把卡整张搬到另一个项目（编号和历史随行）

## 导入导出

- `export_card`：导出交换包（`.novex.zip`——结构 + 载荷 + SHA-256 清单）
- `import_card`：导入后产生未提交草稿，**必须 `commit_import` 确认**后才算入库——这是导入流程，不是日常改卡；日常改卡直接落盘

## 用户消息开头的 `<noven-selection …/>`

用户选中画布上的东西再发消息时，消息正文最前面会带选中标签（最多 3 个，随后换行接用户的话）。标签里的 `card` / `target` / `module` / `item` / `block` 编号**可以直接用于工具调用**——`root_id` 用 `card`，模块定位用 `module`，时间线事件/集合条目用 `item`。`type="doc.range"` 还带 `block`/`start`/`end`/`quote`，指一段选中文字。别把这个标签当作用户要写的内容，它只是"指着什么说"的手势。

## 回执怎么读

所有卡工具返回结构化 JSON：操作状态、新编号、版本号、卡目录路径都在里面。看到 `"done"` 之外的字段就是有信息要读，别只取状态。

## 图片与缩放

模块正文里的图片是独占一行的：

```
![图注](card-image:<资源编号>#<图片块编号> "w=45%")
```

- 宽度写在 title 位：`"w=10%"`–`"w=100%"`，省略即原宽。人和 AI 用同一约定——用 `write_markdown` 写带宽度 title 的图片行，编辑器里看到的缩放就是它。
- 图片必须引用本卡资源（先 `adopt_image` / 导入已有文件拿到资源编号）；编号可省略，解析时新生成。
