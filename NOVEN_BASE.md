# Noven 桌面端 · 底座基线

> 本仓库 = DeepSeek Harness (DSH) fork + 诺文产品层。
> 原则：**核心不改，产品全走插件**。凡动到 DSH 原有文件，必须在下面账本登记一行。

## 基线（钉死）

| 项 | 值 |
|---|---|
| 底座 | DeepSeek Harness (MIT) |
| 官方上游 | https://github.com/deepseek-ai/deepseek-harness（`upstream` remote） |
| 我们的 fork | https://github.com/ccbili30-collab/deepseek-harness（`origin` remote） |
| 基线 commit | `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 基线版本 | dsh-v0.1.7-rc.2（tag 同名） |
| 钉线日期 | 2026-09-29 |
| 产品分支 | `noven/main` |

### 选 0.1.7-rc.2 而不是 0.2.0-rc.1 的原因

插件生态（含 dsh-better-sidebar）peer 范围是 `^0.1.7-rc.1`，caret 锁 0.1.x，**不含 0.2.0**。钉 0.2.0-rc.1 会重复"插件装上跑不起来"的坑。等主流插件适配 0.2 后再重钉。

### 基线历史

| 日期 | 基线 | 说明 |
|---|---|---|
| 2026-09-29（废弃） | `141eb6fef8` dsh-0.1.0-rc.8 | fork 原 master，落后上游太多且不满足插件 peer，当天弃用 |

## 补丁账本（动核心必登记）

| 日期 | commit | 动了什么文件 | 为什么 | 能否回归上游 |
|---|---|---|---|---|
| （暂无——目标是一直空着） | | | | |

## 升级纪律

- DSH 还是 developer preview，破坏性变更多。**升级 = 重钉基线**：新基线 commit 写进上表（保留历史），`noven/main` 上我们的提交逐个 cherry-pick 回来，补丁账本逐行核对。
- 升级前先跑 `pnpm install && pnpm run build` 确认绿，再动基线。
- 重钉基线后，社区插件要在 profile 里重装并回归：`pnpm dsh plugin --profile web add dsh-better-sidebar`。

## Profile 与社区插件

- 运行 profile：`web`（`~/.dsh/profiles/web/`），bundle 层：`dsh-base` + `dsh-web-app` + `dsh-better-sidebar`
- `dsh-better-sidebar@0.22.0`：VSCode 式右侧栏（文件树/编辑器/Git/终端/浏览器/任务/侧边对话）+ 底部工作台；开放 `ctx.betterSidebar.registerTab / registerFileViewer`——**诺文三库（艺术库/灵感库/传承库）未来经此 API 注册为原生 tab**
- 版本约束备忘：插件 0.24.1 要求 Node ≥22.19，本机 22.14 → 装的是 0.22.0；将来升 Node 后可 `dsh plugin update` 到 0.24.x
- 社区插件装在 `~/.dsh/profiles/web`（pnpm 管理），**不进本仓库**，不属于补丁

## 诺文产品层（只放新增，不算补丁）

- `plugins-noven/` — 诺文自有插件包（命令：/study /draw-map /draw-comic /causality；面板：艺术库/灵感库/传承库等，按拆解清单逐步迁入）
- 旧版参考源码在仓库外：`../noven-legacy-src/`（只读参照，勿直接复制代码——旧底座与 DSH 许可证/架构均不同，一律重写）

## 本机环境备忘

- Node v22.14.0（`~/.local/nodejs/`，`~/.local/bin` 在 PATH）；pnpm 11.7.0（npm 全局装 + 软链到 `~/.local/bin`，与仓库 packageManager 一致）
- 跑起来：`pnpm install && pnpm run build && pnpm dsh web`
