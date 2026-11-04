# Noven image

[English](README.md) | 中文

生图工具与模型列表路由每次操作都通过 `credentials` 解析密钥。非空的直接 `apiKey` 保持优先，否则 `apiKeyEnv` 指向共享凭据引用，也包括环境变量提供方。已保存的地址、模型、输出目录和凭据引用保持原值。配套运行时必须装配 `credentials`，缺少提供方时插件不激活。

现有设置页在保存前暂存输入。凭据写入被拒绝时，即使旧密钥仍有效也保留草稿。保存捕获提交时的凭据引用，后续编辑不能改变该次写入目标。更改连接、放弃草稿、关闭页面或卸载插件会取消模型探测并拒绝过期响应。拉取模型不写设置。

`modelRequestTimeoutMs` 控制 Host 探测超时，默认保持原来的 15000 毫秒。路由接受可选的 `base`、`apiKey`、`apiKeyEnv` 字符串，校验模型响应，返回标识而不返回密钥值。生成和编辑图片在写文件前检查取消状态。

在仓库根执行 `vitest run --root plugins-noven/noven-image --config vitest.config.mts --configLoader native --maxWorkers 1`。控制器套件验证注入动作，提供方套件使用传输替身验证注册路由和工具。shell 的 `tests/packed-runtime.mjs` 验证两个客户端对候选安装包的构建。本组回滚无需迁移数据，密钥字面值仍不进入设置响应。服务商预设与页面重排属于单独的产品决策。
