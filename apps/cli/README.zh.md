# `@deepseek-ai/dsh`

[English](README.md) | 中文

`dsh` 是 DeepSeek Harness 中用于启动 profile 的命令；profile 由多个插件组合包 patch 层按顺序叠加而成，其上再应用用户自己的覆盖配置。[`src/args.ts`](src/args.ts) 负责命令语法，[`src/bin.ts`](src/bin.ts) 只加载选中的运行器。无效命令、来自其他模式的选项、配置错误和启动失败都会以非零状态退出。

## 入口模式

| 命令 | 用途 |
|---|---|
| `dsh --profile <name>` | 启动位于 `$DSH_HOME/profiles/<name>` 的指定 profile。 |
| `dsh --profile headless "job"` | 运行一个全新的持久化会话，打印最终答案并退出。 |
| `dsh web` | `--profile web` 的别名。 |
| `dsh plugin --profile <name> <pnpm args>` | 通过在 profile 目录中转发给 pnpm 来管理该 profile 的插件。 |
| `dsh recovery <command>` | 创建、校验和恢复不依赖启动链的恢复检查点。 |

运行命令时所在的目录将作为默认 workspace 根目录。`web` 和 `headless` profile 在首次使用时会从随附模板自动初始化；其他任何 profile 都必须通过 `dsh plugin` 创建。

## 应用参数

启动器只解析自身的 flag，并将其后的所有内容交给已启动的 profile；注入该 profile 的任意应用插件都可以解析这份共享的不可变快照（[`dsh-cmdline`](../../packages/boot/cmdline/README.md)）。因此，启动器的 flag 必须写在最前面；启动器无法识别的第一个 token 标志着应用参数的开始：

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

## Profile

profile 目录包含一个 `package.json`，其中记录树外插件依赖，以及 profile manifest（元数据清单）`dsh.profile` 和其中按顺序排列的 `bundles` 列表；还包含一个 `cordis.patch.yml`，其中保存用户自己的 patch 层。

配置树以空根为起点，依次叠加以下配置层：
- `dsh.profile.bundles` 中各组合包的 patch
- profile 自身的 `cordis.patch.yml`，然后是 home 级的 `$DSH_HOME/cordis.patch.yml`
- `--patch` 指定的覆盖层

`dsh.profile.bundles` 中列出的组合包先从 dsh 安装目录解析（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`），再从 profile 自身的 `node_modules` 解析；pnpm 会将树外插件安装到该目录。

使用 `--dump-default-config` 和 `--dump-config` 可在不启动的情况下检查组合后的配置树。

## 恢复检查点

`dsh recovery` 会在 launcher 导入应用 boot 或任何插件之前运行。它的外部存储默认位于 `$DSH_RECOVERY_HOME` 或 `~/.dsh-recovery`；该存储必须同时与源码 checkout 和 `DSH_HOME` 分离。

```sh
dsh recovery create --source /path/to/deepseek-harness --label "before installing a plugin"
dsh recovery list
dsh recovery verify <checkpoint-id>
dsh recovery restore <checkpoint-id> --source /path/to/deepseek-harness --confirm <checkpoint-id> --offline
```

检查点捕获 Git 源码 checkout 和 DSH 控制文件：顶层的 `settings.yaml` 与 `cordis.patch.yml`，以及每个 profile 的 package、patch、lock 和 workspace manifest。它明确排除凭据、`.env` 密钥、Session、附件、storage、依赖树和工作区内容。因此，恢复会回退代码与插件配置，但不会回退新对话，也不会替换后来轮换的凭据。

请通过 `--source` 显式传入 DSH checkout，或设置 `DSH_SOURCE_HOME`；从本地源码启动时会自动公布其 checkout。直接通过 CLI 恢复前必须先停止 DSH Host。恢复会校验所选检查点，要求源码仍处于同一个 Git commit 且目标根目录与记录一致，然后在写入前为当前状态创建并校验一份救援检查点。恢复后的 profile manifest 可能与已有 `node_modules` 不一致；命令会报告需要重新协调依赖。

Web profile 会在展开侧边栏底部的“设置”右侧挂载一个紧凑的电源菜单（收窄侧栏时位于“设置”上方）。它只提供创建检查点、回档至最近检查点和安全关机；检查点历史、完整性校验、路径详情与精确 ID 回档位于设置页的“恢复与回档”栏目。仅限本机回环访问的 Host 桥会启动独立 guardian、请求有边界关停、等待 Host PID 退出后再恢复，并按原命令重启。浏览器只是前端，并非恢复权威；普通 profile 无法启动时请使用 CLI 路径。

层的确切优先级、恢复范围、flag、关闭行为、部署默认值和源码执行方式，以 [CLI（命令行界面）行为参考](reference/README.md)为准。

## 开发

生产运行需要已构建的包与前端产物。请在仓库根目录单独运行 `pnpm run build`，然后使用 `pnpm dsh <args...>` 运行 TypeScript 入口并转发所有参数；模块解析约定以[源码执行参考](reference/README.md#source-execution)为准。
