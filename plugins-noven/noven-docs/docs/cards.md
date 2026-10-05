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

## 改卡：直接写，不用接力版本号

```
read_card { root_id }                    → 返回结构 + 当前版本
add_module_bulk / write_module_text …    → 回执里有 next_draft_version
```

- 写操作**总是套用到卡的最新内容上**：`draft_version` 可以省略，传了也不再参与冲突判定。你在改模块 B 的时候，用户同时改模块 A，两边都不会被拒、也不会互相覆盖
- 只有一种情况会被拒：你要改的**同一个文字块**在你读取之后被别人改过（提示"重新读取后再改"）。这时重新 `read_text_block` 读到新内容，再改
- 想保护一个文字块：局部修改用 `replace_text_range`（带 `content_ref`）；整块替换时给 `write_module_text` 也传 `content_ref`，块被别人改过就会拒绝而不是覆盖
- 正文太长时用 `read_text_block` 分页读；图片资源用 `read_card_image`

## 跨项目的卡

`list_cards` 只列本会话项目的卡库。其他项目的卡：

- 挂载引用卡：`mounted` 清单里有，`read_card` 直接读（`project_root`/`card_dir` 都在回执里），**也能直接改**——改的就是来源项目
- 完全未知项目：`list_projects` 看有哪些项目 → 任何卡工具加 `project` 参数（项目名/编号/路径都行）→ 或者不传让工具自动全项目找
- `move_card` 把卡整张搬到另一个项目（编号和历史随行）

## 导入导出

- `export_card`：导出交换包（`.novex.zip`——结构 + 载荷 + SHA-256 清单）
- `import_card`：导入后产生未提交草稿，**必须 `commit_import` 确认**后才算入库——这是产品流程，不是可绕过的步骤

## 回执怎么读

所有卡工具返回结构化 JSON：操作状态、新编号、版本号、卡目录路径都在里面。看到 `"done"` 之外的字段就是有信息要读，别只取状态。
