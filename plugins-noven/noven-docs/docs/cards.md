# 制卡工作流

## 卡是什么

一张卡 = `卡/<卡名>/` 一个目录：

```
卡/<卡名>/
  card.json      # 卡文档：编号、名字、模块树、资源、世界内角色
  draft.json     # 未提交的草稿（只在你保存过草稿时存在）
  proposal.json  # 挂起的 AI 提案（只在有待确认改动时存在）
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

## 改卡：默认是提案，不用接力版本号

```
read_card { root_id }                    → 返回结构 + 当前版本 + 挂起提案数
add_module_bulk / write_module_text …    → 回执：status "proposed" + 提案改动清单
```

- **AI 的写入默认落成提案**：工具回执 `status: "proposed"` 时，改动已写进 `proposal.json` 叠在画布上等用户确认——**不要宣称已完成**。用户接受后才落到 `card.json`；read_card 读的仍是叠加提案后的预览，可以继续在其上改
- 每张卡有一个信任档（`library.json` 的 `cardMeta[id].aiTrust`）：`propose`（默认）走提案，`auto` 时写操作直接提交、回执 `status: "saved"` + `next_draft_version`
- 写操作**总是套用到最新内容**（人保存不会被挂起的提案挤掉）；`draft_version` 可以省略。只有你读取后被改过的**同一个文字块**会被拒（提示重新读取）
- 想保护一个文字块：局部修改用 `replace_text_range`（带 `content_ref`）；整块替换时给 `write_module_text` 也传 `content_ref`
- 正文太长时用 `read_text_block` 分页读；图片资源用 `read_card_image`

## 预制模块：用专用工具，别手写 JSON

时间线 / 集合模块的内部数据是版本化 JSON（`contents/` 里的 widget 载荷），一律用专用工具改：

- 时间线：`timeline_add_event` / `timeline_update_event` / `timeline_move_event` / `timeline_remove_event` / `timeline_add_era` / `timeline_update_era` / `timeline_remove_era` / `timeline_set_calendar`（历法的 `step` 是拖动吸附步长，用户可自己调精度）
- 集合：`collection_add_field` / `collection_update_field` / `collection_remove_field` / `collection_add_item` / `collection_update_item` / `collection_remove_item` / `collection_set_value` / `collection_set_view`

时间取**数字**，显示靠历法模板；未放置的事件 `at` 省略即可。旧版 `nodes`/`items` 投影由编码时自动重算，不用你维护。

## 跨项目的卡

`list_cards` 只列本会话项目的卡库。其他项目的卡：

- 挂载引用卡：`mounted` 清单里有，`read_card` 直接读（`project_root`/`card_dir` 都在回执里），**也能直接改**——改的就是来源项目
- 完全未知项目：`list_projects` 看有哪些项目 → 任何卡工具加 `project` 参数（项目名/编号/路径都行）→ 或者不传让工具自动全项目找
- `move_card` 把卡整张搬到另一个项目（编号和历史随行）

## 导入导出

- `export_card`：导出交换包（`.novex.zip`——结构 + 载荷 + SHA-256 清单）
- `import_card`：导入后产生未提交草稿，**必须 `commit_import` 确认**后才算入库——这是产品流程，不是可绕过的步骤

## 用户消息开头的 `<noven-selection …/>`

用户选中画布上的东西再发消息时，消息正文最前面会带选中标签（最多 3 个，随后换行接用户的话）。标签里的 `card` / `target` / `module` / `item` / `block` 编号**可以直接用于工具调用**——`root_id` 用 `card`，模块定位用 `module`，时间线事件/集合条目用 `item`。`type="doc.range"` 还带 `block`/`start`/`end`/`quote`，指一段选中文字。别把这个标签当作用户要写的内容，它只是"指着什么说"的手势。

## 回执怎么读

所有卡工具返回结构化 JSON：操作状态、新编号、版本号、卡目录路径都在里面。看到 `"done"` 之外的字段就是有信息要读，别只取状态。
