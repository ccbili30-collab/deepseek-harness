# Noven Mac 发布计划

日期：2026-10-23（首版发布 2026-10-24）
状态：首版已发布；2026-10-24 品牌占位冲突热修复已替换首版构建；剩余项见 §6
工作区：`noven-web` / `noven-pc-test` / `noven正式版`
发布：https://github.com/ccbili30-collab/noven-releases/releases/tag/20261023-4df2b28124

## 0. 目标

在 Apple Silicon 上交付一个干净的 `Noven.app`：不 fork DSH 引擎、不改引擎包名，DSH 只作内核依赖；用户看不到 DSH 的产品身份。Web、PC 测试、正式版三个工作区完全隔离；正式版只产出 unsigned DMG，通过公开的 `noven-releases` 仓库发布，不做自动更新。

## 1. 最终形态

```text
noven-web/                 # Web 实验：代码 + 全部 web 数据
  .data/
    harness/               # DSH_HOME：会话、设置、凭据
    library/               # NOVEN_HOME：项目注册表、创作库账本
    projects/              # 默认/杂项项目
  ...源码...

noven-pc-test/             # PC 测试：代码 + 全部测试数据
  .data/
    harness/
    library/
    projects/
  Noven Test.app
  ...源码...

noven正式版/                # 只放正式安装包
  Noven-<构建号>.dmg
  SHA256.txt
  README.md
```

- `noven-web` 和 `noven-pc-test` 都有代码和数据，用同一个 git 仓库的 worktree/branch，避免两份代码漂移；`.data/` 进 `.gitignore`。
- `noven正式版` 没有代码、没有测试数据。正式 app 从 DMG 安装到 `/Applications`，运行时数据在 `~/Library/Application Support/Noven/`。
- Web 数据一次性从 `~/.dsh` + `~/.noven` 复制到 `noven-web/.data`，原目录保留作备份；之后 web 只写自己的 `.data`。
- PC 测试 app 从自己旁边的 `.data/` 读数据；删掉 `.data` 就是重置测试。
- 项目文件夹是用户自己打开的，软件不抢、不做项目锁。

## 2. 已定决策

1. **不 fork 引擎，不改 DSH 包名**：DSH 只作内核依赖；产品身份属于 Noven。
2. **全局设置不进画布**：画布是工作台，设置保持独立面板。
3. **移除 `dsh-better-sidebar`**：产品包和开发 profile 都不带；它提供的任务管理、文件变动、侧边对话、侧边卡片设置、底部面板随之下线。
4. **三个工作区完全隔离**：Web、PC 测试各自代码 + `.data`；正式版只放干净安装包。
5. **只发 Apple Silicon**：首发不覆盖 Intel Mac。
6. **unsigned/ad-hoc**：不买 Apple 证书、不公证；README 写清 Gatekeeper 放行。
7. **不做自动更新**：GitHub 只发正式 DMG；设置里的“检查更新”只打开 Release 页面。
8. **公开 releases-only 仓库**：`noven-releases` 只放安装包、校验和、README，不放源码。
9. **版本不做 semver 仪式**：用构建号 `YYYYMMDD-HHMM-<短commit>`；关于页、文件名、Release 标题都用它。版本字段可固定 0.1.0。
10. **Logo 暂用用户提供的鸟+轨道图**，打包时生成 1024 图标；后续换透明底正方形源文件。

## 3. 阶段与验收

### Phase 0：工作区与数据隔离

- 把当前 `noven-pc` 工作区改名为 `noven-web`（会话外操作，避免当前 cwd 失效）。
- 建 `noven-pc-test` 的 worktree/branch，和 `noven-web` 共用历史。
- 给 `noven-ledger` 加 `NOVEN_HOME`，给项目根加 `NOVEN_PROJECTS_ROOT`；默认仍是 `~/.noven` / `~/诺文`，只有显式设置时才改。
- Web 启动命令固定 `DSH_HOME=noven-web/.data/harness`、`NOVEN_HOME=noven-web/.data/library`、`NOVEN_PROJECTS_ROOT=noven-web/.data/projects`。
- PC 测试 app 支持“旁边有 `.data/` 就用它”，否则用 Application Support；正式 app 没有 `.data/`，走正常路径。
- PC 测试和正式版的身份、端口、协议、userData、日志全部分开：`Noven Test` / `Noven`，19388 / 19387，`noven-test://` / `noven://`。
- `.data/`、构建产物、DMG 进 `.gitignore`。
- 验收：web 建/删会话、改设置、删项目、换 key，PC 测试的 `.data` 和正式版数据一条不变；两边同时开不撞端口、不抢锁。

### Phase 1：产品面收口

- 从 Noven 默认包和 Web profile 移除 `dsh-better-sidebar`。
- `noven-workbench` 的 `betterSidebar` 依赖改成可选；两处注册加守卫，否则 workbench 不激活。
- 清理 `noven-shell` 的 sidechat 死路由（`/sidebar/api/sidechat.*`），侧边对话入口随插件消失。
- 设置默认隐藏「内置插件 / Agent 预设」；侧边卡片随 better-sidebar 消失。设置面板标题连点 10 次进入开发者模式，flag 存 localStorage。
- 从 Agent 预设列表删除「设定管理员」入口；内部 preset 保留给 sidecar，不动「设定」页。
- 设置内容审计：扫一遍剩余 section，去掉不适合 Noven 的项。
- 产品身份：名称 Noven、appId `com.noven.pc`、用户提供的鸟+轨道图标、`noven://` 协议。
- 关于页：显示构建号 + DSH 内核版本；版本字段可固定 0.1.0。
- Noven 首启：不再走 DeepSeek 账户/API Key 欢迎页；提供“开始创作 + 配置模型”，允许稍后配置。
- 关闭桌面壳的强制更新、自动更新、账户检查和遥测；启动时除模型调用外不发网络请求。
- 验收：菜单和设置里没有 better-sidebar 痕迹；内部项默认不可见，10 次点击后出现；设定管理员不在列表；关于页显示 Noven 构建号；首启能配模型并进入创作。

### Phase 2：稳定性

- 修终端画布页切走/切回丢会话：页面按页签常驻，或把“关闭页签”和“卸载”分开；切页签只隐藏，关页签才回收终端。
- 保持文件/产出/终端都走画布页签，不回到右栏。
- 启动 P1：会话列表首帧快照、树/焦点首帧本地状态，目标是暖启动 ≤500ms、首帧即最终内容。
- 验收：终端输入标记 → 切走 → 切回，标记还在；关页签才回收；画布路由不回退；启动曲线记录在案。

### Phase 3：打包

- 加 unsigned/ad-hoc 本地打包模式：绕过现有脚本的 Developer ID、公证、更新 feed 校验；不连 DeepSeek 更新源。
- 做 Noven 默认包（发布 profile）：只含 `noven-*` 和必需基础服务，不含 better-sidebar、测试插件、内部预设入口。
- 桌面壳身份改造：productName、appId、协议名、artifact 名、图标、关于/菜单/欢迎页文案；隐藏/替换 DeepSeek Harness。
- 用提供的 logo 生成 1024 图标和 icns；测试版图标加角标/颜色，肉眼区分。
- 从 `noven-web` 的同一 commit 打 `Noven Test.app` 到 `noven-pc-test/`，测试数据写它的 `.data`。
- 验收：测试包能干净安装、首启、配模型、建项目、写卡/文稿、开终端、切页签、重启；Gatekeeper 放行流程可用；卸载重装数据保留；测试包不碰正式数据。

### Phase 4：发布

- 建公开 `noven-releases` 仓库，仅放 Release，不放源码。
- README：软件介绍、截图、系统要求（Apple Silicon）、安装步骤、Gatekeeper 放行、已知限制、更新方式、LICENSE/THIRD_PARTY_NOTICES。
- 从测试通过的 commit 打正式 DMG 到 `noven正式版/`；在干净 macOS 用户账号安装一次，跑完整 smoke。
- 产物：`Noven-<构建号>.dmg` + `SHA256.txt` + `README.md`；GitHub 只发这一份，不发测试包。
- 设置里的“检查更新”只打开 Release 页面，不做自动更新。
- 验收：别人拿到 GitHub 链接能下载、第一次右键打开、正常创作；正式文件夹里只有干净安装包。

## 4. 验证矩阵

- **Web 隔离**：建/删会话、改设置、删项目、换 key，PC 测试和正式数据不变。
- **PC 测试**：干净安装、首启、模型配置、建项目、写卡/文稿、终端切页签、设置隐藏/开发者模式、单实例、协议、Gatekeeper、卸载/重装。
- **正式版**：干净用户账号安装；与测试包同 commit；没有测试 key/数据/插件；启动无更新/账户/遥测请求；数据在 Application Support；README/校验和齐全。
- **性能**：打包版启动时间、终端切页签、画布路由回归。
- **失败路径**：无模型 key、无网络、端口占用、重复打开、旧数据目录、误开同项目文件夹——至少确认不会崩溃或污染另一边。

## 5. 风险

- unsigned 会被 Gatekeeper 拦；企业管控 Mac 可能直接拦截。README 写清楚。
- 只发 Apple Silicon；Intel 不支持。
- 没有自动更新，新版靠 Release 手动下载。
- 桌面包带 Node/Python runtime，体积和首次构建时间都不小。
- 拔 better-sidebar 会改变右栏布局，需要真机确认宿主 `ui-sidebar-right` 接管；旧布局可能要重置一次。
- Web 数据迁到 `noven-web/.data` 是一次性迁移，先备份原 `~/.dsh`/`~/.noven`。
- PC 的独立 home 意味着模型 provider/API key 不会从 web 继承，首启必须能配。
- 测试包和正式包身份不同，不能直接验证“正式版覆盖升级”；用干净用户账号安装新旧正式 DMG 做升级演练。
- 改名 `noven-web` 要在会话外做，避免当前工作目录和工具链路径失效。

## 6. 当前状态

已完成（首版 2026-10-24）：

- 工作区：`noven-web`（源码+`.data`）、`noven-pc-test`（worktree+`.data`+`Noven Test.app`）、`noven正式版`（只放发布物）。Web 3083、正式 19387 / `Noven` / `com.noven.pc` / `noven://`、测试 19388 / `Noven Test` / `com.noven.pc.test` / `noven-test://` 三实例可同时运行，会话/账本/凭据/userData 分根。
- 产品面：`dsh-better-sidebar` 从 Web profile 和 Noven 种子 profile 移除；workbench 的 `betterSidebar` 改可选；sidechat opener/发送分支清理；设置默认隐藏内置插件/Agent 预设，设置标题连点 10 次解锁开发者模式；`设定管理员` 从 Agent 预设 roster 隐藏（内部 preset 仍可 resolve）；关于页显示 `Noven 0.1.0` + 构建号 + 内核 `0.1.7-rc.2`；跳过 DSH 账户/API-key 欢迎页；无自动更新/遥测。
- 稳定性：终端画布页切页签保活（页面按页签常驻、只切显隐）；终端 xterm 保持在 `client.terminal.js` 异步 chunk；文件/产出/终端画布路由保持。
- 打包：unsigned/ad-hoc 模式绕过签名、公证、更新 feed；Noven 默认种子 profile 打进 `Resources/noven-profile`，首次启动自动播种；Noven 图标/协议/appId；正式 DMG 与测试 app 从同一提交构建。
- 发布：公开 `ccbili30-collab/noven-releases`，只发正式 DMG + SHA256 + LICENSE + THIRD_PARTY_NOTICES；当前 tag `20261023-4df2b28124`，README 含介绍/安装/Gatekeeper/限制。首版 `20261023-03c11ee084` 因打包版暴露 DSH 原生欢迎层已删除并替换。
- 热修复（2026-10-24）：根因是 `ui-brand-official` 与 `noven-brand` 同时注册 `sidebar.brand.mark`，导致 Noven shell 启动中断、露出 DSH 原生界面。种子 profile/现有 profile 禁用官方品牌占位，`project-manager` 对 Noven profile 幂等写入 `ui-brand-official` 禁用补丁；窗口标题与 macOS 菜单/关于文案从 `DeepSeek Harness` 改为 `Noven`。修复版 DMG SHA256 `5179e84d0a4fdb53fd017ab9bfab6f4c007fca3e32ceecde63e4f175cd79217a`，已用干净数据根实测首启为 Noven 工作台。
- 私有源码：`ccbili30-collab/noven-pc` main 已推送到本次热修复提交。
- 验证：root build、24 个聚焦测试文件 192 项全绿；终端 xterm 拆分测试通过；三实例端口/数据根实测；DMG 校验和、appId/协议/build ID/内核版本实测；未签名 `spctl` 拒绝（预期）。

未完成 / 明确限制：

- 启动 P1 的暖启动 ≤500ms 仍未达成（Web 树/输入约 1.8s）；打包版启动未做精确计时。
- Gatekeeper 只提供手动放行说明，未做公证；企业管控 Mac 可能拦截。
- Office 的 LibreOffice 原生引擎在本 unsigned 构建中缺失，Office 转换可能不可用。
- 正式 DMG 未在“干净 macOS 用户账号”上完整走建项目/写卡/文稿/卸载重装；Web 侧创作链路此前已验证，打包版做了启动/数据根/插件加载验证。
- 设置内容审计（除隐藏两项外）未做。
- 测试工作区的 app 由 `noven-web` 构建，测试 worktree 用于代码/数据隔离，尚未独立构建。

## 7. Goal 启动词

```text
完成 Noven Mac（Apple Silicon）桌面版的可测试发布。保持 DSH 作为内核依赖，不 fork、不改引擎包名；产品层完全 Noven 化。

工作区：把源码工作区改名为 noven-web；建立 noven-web / noven-pc-test / noven正式版 三个平级目录。noven-web 和 noven-pc-test 各自包含代码与 .data（harness/library/projects），所有 Web/测试数据只写各自目录；noven正式版 只放正式 unsigned DMG、SHA256、README，不放代码/测试数据。PC 正式版按正常 Mac 软件安装，数据在 ~/Library/Application Support/Noven。禁止 Web 与 PC 测试共享 DSH_HOME、NOVEN_HOME、项目注册表、账本、凭据、端口、协议、userData。

产品面：从 Noven 包和 Web profile 移除 dsh-better-sidebar，noven-workbench 的 betterSidebar 依赖改可选，清理 sidechat 死路由；设置默认隐藏内置插件/Agent 预设，设置面板标题连点 10 次进入开发者模式，删除设定管理员入口；使用 Noven 名称、appId、用户提供的鸟+轨道图标、构建号、noven:// 协议；关于页显示构建号与 DSH 内核版本；关闭 DSH 账户/更新/遥测；Noven 首启可配置模型；不要 fork 引擎，不要把全局设置搬进画布，不要重新引入 better-sidebar。

稳定性：修复终端画布页切走/切回丢会话；保持文件/产出/终端画布路由；启动尽量达到暖启动 ≤500ms、首帧即内容。

打包与发布：加 unsigned/ad-hoc 本地打包模式，绕过签名、公证、更新 feed 校验；做 Noven 默认包（发布 profile）；版本不做 semver 仪式，用构建号（日期+短 commit）标识，关于页和 Release 标题都用它；从同一 commit 打 Noven Test 和正式 DMG；在 Apple Silicon 真机验收干净安装、首启、建项目/写卡/文稿、终端、设置隐藏/开发者模式、Web/PC 数据隔离、单实例/端口/协议、Gatekeeper 放行、卸载/重装数据保留。建立公开 releases-only 仓库 noven-releases，README 写软件介绍、安装、Gatekeeper、系统要求、已知限制；GitHub 只发布正式 DMG + SHA256，不发测试包。保留三条线合并修复。
```

短版：

```text
/goal 按《Noven Mac 发布计划》执行：noven-web / noven-pc-test / noven正式版 三工作区完全隔离；拔掉 better-sidebar；设置收口（隐藏内置插件/Agent 预设、10 次点击开发者模式、删设定管理员）；Noven 身份、构建号、图标、协议；关掉 DSH 账户/更新/遥测；首启配模型；修终端切页签保活；加 unsigned 打包模式，真机验收；公开 noven-releases 只发正式 DMG + SHA256。不 fork 引擎，不把设置搬进画布，不破坏三条线合并修复。
```
- 依赖热修复（2026-10-24）：正式种子 profile 只拷了 `noven-*` 包，漏了 `trash`、`@deepseek-ai/dsh-tools`、`dsh-skill-filesystem` 及其运行时闭包，导致 `noven-library`/`noven-cards`/`noven-skills` 导入失败、`/api/noven-projects` 与 `/api/noven-library` 404，工作台/地图/卡片全部打不开。已按实际 import 闭包重建种子 `node_modules`（只保留 `dsh-*` 的运行时闭包，避免重复 `dsh-persona` 注册），并修复未选项目时新建杂项会话冲掉新页签的问题。新 tag `20261023-4df2b28124`，SHA256 `5179e84d0a4fdb53fd017ab9bfab6f4c007fca3e32ceecde63e4f175cd79217a`；旧 `df5f2042cc` 已删除。
