# Noven cards

[English](README.md) | 中文

整模块编辑可带 `expectedText`：Host 在卡片串行写入中比较已存 Markdown，拒绝正文冲突；HTTP 回执的 `savedText` 是已存正文。未带期望的旧调用保持当前语义，编辑不同模块无需整卡修订号相同。这些字段不进入卡片持久数据。`node tests/run.mjs markdown-save` 通过真实路由验证冲突、输入拒绝和旧调用。

卡片、模块和内部角色共享根卡的载荷目录。读取、地图请求、引用索引和导出使用完整文档树；每个模块由所属文档的资源表解析图片。

复制内部角色先分配编号，再搬运正文、图注、图片和扩展文件。自身引用指向目标世界，外部引用保持原地址。导入为每个模块分别重映射局部编号；不同地图中相同的地标编号互不影响。预览规范中的素材标签、时间线人物名称和普通文字字段保持原样。

交换包校验失败、载荷缺失或结构化 JSON 无效时，操作拒绝，目标卡的已提交修订不变。导入使用既有草稿确认流程。

现有卡片格式、资源路径格式和交换包版本不变。读取不迁移或重写文件；普通文本只有本卡 `card-image:` 引用在复制和导入时随资源编号改写。图片和不透明扩展保持字节一致。此前运行时能读取复制和导入后的卡片；回滚代码不会删除已生成卡片、历史修订或载荷。

构建：在仓库根依次执行 `tsc -p plugins-noven/noven-ledger/tsconfig.json`、`tsc -p plugins-noven/noven-fmg/tsconfig.json`、`tsc -p plugins-noven/noven-cards/tsconfig.json`。回归入口：`node plugins-noven/noven-cards/tests/run.mjs resource-closure round-trip routes map`。测试进程使用独立的 `NOVEN_HOME` 和项目目录。
