# Noven 插件接入规范（DSH 0.1.7-rc.2）

> 第 0 步施工结论。所有诺文功能按此模子进 `plugins-noven/`，DSH 核心零改动（补丁账本保持空白）。

## 包结构

```
plugins-noven/               # 独立 pnpm workspace，不进主仓 workspace
  pnpm-workspace.yaml        # packages: ['*']
  <pkg>/                     # 每个插件一个包，命名 noven-*
    package.json             # 见下
    tsconfig.json
    cordis.patch.yml         # 挂载行
    src/index.ts             # 宿主半边：name/inject/apply(ctx)
    src/*.ts
```

## package.json 要点（照抄 better-sidebar 的封装）

- `"type": "module"`，`main: lib/index.js`，exports 带 `./package.json`
- `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "manifestVersion": 1 }` —— 声明了这个，`dsh plugin add` 才会把包挂进 bundle 层
- peerDependencies 指向 npm 上的 `@deepseek-ai/*`（`^0.1.7-rc.1`，与基线 0.1.7-rc.2 兼容；cordis `^4.0.4`）
- devDependencies 装同名包用于本地 tsc 类型检查
- 浏览器半边（仅 UI 插件需要）：`exports["./client"]` 指向 `lib/client.js`，`"dsh.client": { inject: [...], platform: "web" }`；构建 = `tsc + tsdown` 打 lazy-CJS bundle

## cordis.patch.yml 模板

```yaml
- insert:
    - id: <pkg-id>
      name: '<npm-name>'
```

## 四个扩展口子（已核实）

| 口子 | API | 备注 |
|---|---|---|
| 技能 | `ctx.skills.register({ name: 'noven-*', description, whenToUse?, content, source: 'runtime', invocation: { modelInvocable, userInvocable } })` | kebab-case；模型经 `skill({name})` 工具调用 |
| 斜杠命令 | `ctx.commands.register({ name, description, input?: { hint, attachments? }, handler })` | handler 不直接见模型；驱动模型用 `invocation.agent.followup(createUserMessage({ content: [{type:'text', text}], source: {kind:'user'} }))`（`createUserMessage` 来自 `@deepseek-ai/dsh-llm`） |
| 工具 | `ctx.tools.register(defineTool({ name, ... }))`（`defineTool` 来自 `@deepseek-ai/dsh-tools`） | 参照 `packages/fs/tool-fs/src/read.ts` |
| 浏览器 UI | 客户端插件 `ctx.slots.register({name: '<slot>'}, Component)`；侧栏页用 better-sidebar 的 `ctx.betterSidebar.registerTab` | 品牌插槽：`sidebar.brand.mark` / `sidebar.brand.name` |

## DSH 内置工具名（技能正文引用用这些）

`read`（文本）、`read_image`（图片，视觉模型可读）、`write`、`edit`、`grep`、`glob`、`web_search`、`web_fetch`

## 安装与验证

```bash
cd plugins-noven && pnpm install && pnpm --filter <pkg> build   # 编出 lib/
pnpm dsh plugin --profile web add link:/abs/path/to/plugins-noven/<pkg>   # link: 进 profile，改代码重装即生效
pnpm dsh dump-config --profile web    # 应能看到 <pkg-id> 挂载行
```

## 命名纪律

包名/技能名/命令名一律 `noven-*`；隐藏目录 `.noven/`；协议 `noven-workbench://`；旧 creatx 词汇清零。
