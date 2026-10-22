# 自由界面与自由 3D

自由模块是这套产品的**最大自由层**：AI 在这里写任意 HTML/CSS/JS（可选 TypeScript 语法糖）和 three.js，模块在画布里直接渲染、直接交互，不需要用户离开应用、也不需要先落一个 `.html` 文件。

结构化模块（档案、图鉴、时间线、地图、关系图）是预制菜；自由模块是现炒菜。**要做界面、游戏、3D、图表、小工具、可视化时，默认走自由模块，不要写文件。**

## 什么时候用哪种

- **自由界面（surface）**：任意网页界面、小游戏、表单、看板、可视化、自绘图表。唯一入口是卡里的一个 `html` 模块。
- **自由 3D（free3d）**：three.js 场景、模型查看器、空间交互、3D 小游戏。它也是 `html` 模块，只是运行时带 three.js。
- **文件**：只有沙箱做不了时才落文件——需要项目里的二进制资产（大 glb、视频）、需要外网、需要未内置的库、或产物必须被其他工具/人直接消费。落文件后用 `module_embed_file` 把它挂回卡里，用户在卡里仍然看得到。

## 工程格式

自由界面是一个工程，不是一段源码。它存在模块的第一个文字块里：

```json
{
  "version": 1,
  "kind": "surface",
  "noven": {
    "entry": "index.html",
    "files": {
      "index.html": "<!doctype html>…",
      "style.css": "…",
      "main.js": "…"
    },
    "manifest": {
      "name": "作品名",
      "description": "一句说明",
      "cover": "卡图片资源编号或 data URL",
      "fullscreen": false,
      "chrome": "game"
    }
  }
}
```

- `entry` 必须在 `files` 里；相对路径、可带子目录，不允许绝对路径与 `..`。
- 单文件上限 1 MiB，整工程上限 8 MiB。更大的素材放项目文件，用资产桥读。
- `index.html` 里的 `<link href="./style.css">` 和 `<script src="./main.js">` 会在渲染前内联；`./util.js` 这类相对 ESM import 会递归内联成 data URL。
- `manifest.chrome`：`game` 显示存档/暂停/导出/分享的小条；`none` 只留全屏与工具入口。

## 工具序列

改自由界面**按文件改**，不要整包重写 JSON：

```
surface_read { root_id, target_id, module_id, path? }
surface_write_file { root_id, target_id, module_id, path, text, content_ref? }
surface_delete_file { module_id, path, content_ref? }
surface_rename_file { module_id, from_path, to_path, content_ref? }
surface_set_manifest { module_id, name?, description?, cover?, fullscreen?, chrome?, content_ref? }
surface_validate { module_id }
surface_diagnostics { module_id }
```

- 第一次写一个旧原始 HTML 模块时，`surface_write_file` 会自动把它包成 `index.html` 工程；也可以先 `surface_init`。
- `content_ref` 用 `surface_read` 返回的值；模块在你读取后被别人改过时会拒绝，重新读即可。
- `surface_validate` 是静态检查：entry、路径、字节上限、相对 import 是否有文件。`unresolved` 是警告，不阻断写入。
- `surface_diagnostics` 读运行日志（宿主在页面打开时上报，按模块保留最近 200 条）。写完至少看一次；没有日志通常意味着页面还没被打开。
- 整包 `write_module_text` 仍可用于批量导入，但日常迭代不要用它。

## 运行时：NOVEN_FRAME

沙箱是 `srcdoc` iframe，`sandbox="allow-scripts allow-pointer-lock"`，断网（`connect-src data: blob:`）、不同源。页面里可以直接用：

| API | 作用 |
|---|---|
| `NOVEN_FRAME.ready()` | 告诉宿主首帧已就绪（全屏壳用它判断超时） |
| `NOVEN_FRAME.asset(idOrPath)` | 同步取已缓存的 blob URL；卡图片资源 id 或项目相对路径 |
| `NOVEN_FRAME.assetAsync(idOrPath)` | 等待资产到达再返回 blob URL（glb/纹理/音频/JSON 用这个） |
| `NOVEN_FRAME.cardRead()` | 读宿主卡快照（卡名、卡类、模块清单） |
| `NOVEN_FRAME.cardWrite(command)` | 写卡内白名单命令（集合/时间线/文字块） |
| `NOVEN_FRAME.openCard(cardId)` | 打开另一张卡 |
| `NOVEN_FRAME.openModule(moduleId, itemId?)` | 打开本卡另一个模块（带来源回链） |
| `NOVEN_FRAME.navigate({cardId,moduleId,itemId})` | 通用跳转 |
| `NOVEN_FRAME.query(domain,id)` / `compose(text)` / `send(text)` | 把一句话排进侧边对话/主对话 |
| `NOVEN_FRAME.gameSave(state)` / `gameLoad()` | 存档；宿主提供存档槽，存档键按卡:模块隔离 |
| `NOVEN_FRAME.screenshot()` | 截图：canvas 优先，DOM 用 foreignObject 兜底 |
| `NOVEN_FRAME.update(patch)` | 宿主热推状态；配合 `window.addEventListener('noven:frame', …)` |
| `NOVEN_FRAME.gamePaused` | 宿主暂停位；动画循环读它，页面不可见时自动置真 |

主题变量由宿主注入：`--nv-accent`、`--nv-text`（也写作 `--nv-primary-text`）、`--nv-surface`，深色模式带 `color-scheme: dark`。内嵌预览默认继承产品令牌；整页/全屏是作品模式，可以有自己的画风。

## 3D

自由 3D 用同一套工程，只是运行时注入本地 three.js（0.180.0）：

```js
import('NOVEN_THREE').then(async THREE => {
  const url = await NOVEN_FRAME.assetAsync('模型/场景.glb')
  const gltf = await new THREE.GLTFLoader().loadAsync(url)
  const controls = new THREE.OrbitControls(camera, renderer.domElement)
  NOVEN_FRAME.ready()
})
```

- 内置导出：three 核心、`GLTFLoader`、`RGBELoader`、`OrbitControls`、`PointerLockControls`。
- 未内置的 addon 可以把源码作为工程文件带进来，但从 `'three'` 的裸 import 不可解析；统一从 `NOVEN_THREE` 取核心。
- 第一人称交互可用 `PointerLockControls`（iframe 已允许 pointer lock）。
- 音频/视频用 `media-src data: blob:`；先 `assetAsync` 拿 blob URL 再赋给 `<audio>`。
- 页面切走、抽屉收起、标签页不可见时，宿主会推 `gamePaused`；动画循环应读它停帧。
- 压缩 glTF（Draco）暂未带解码器；用普通 glTF/glb 或自行内联解码资源。

## 页面、全屏与存档

- 打开自由模块默认是**整页**：模块占满画布，没有阅读版心、没有高度上限、没有内滚动。
- 页面工具条和游戏小条浮在作品上，静止时淡出；**全屏**把当前页铺满画布，Esc 退出；画布自己的全屏再盖住导航/抽屉/对话。
- 全屏是页签的呈现状态，不是新的覆盖层；切页签会退出模块全屏，布局树不变。
- 存档走 `gameSave`，宿主按卡:模块存 localStorage，并可在工具条里导出独立 HTML；导出会内联卡图片资源与 three 运行时。

## 限制

- **没有网络**：不能 fetch 外网、不能引 CDN。需要联网就走文件退路并在说明里写清。
- **没有同源**：不能读宿主 DOM、不能用 localStorage（存档走桥）。
- **资产只读**：项目文件按会话围栏读取，页面不能写文件。
- **体积**：工程 8 MiB、单文件 1 MiB；大素材放项目文件。
- 自由模块不参与移动端格式保证；手机端不在当前范围。

## 画风

- 内嵌预览（卡页/总览缩略）是产品内视图：优先用 `--nv-*` 令牌、系统字体、产品间距。
- 整页/全屏是作品：可以深色、衬线、全屏画布，但要有明确的构图，不要把一个 520px 的卡片塞进整页。
- 默认模板（`list_module_presets` 可见，用 `add_module_preset` 落卡）：`surface`（自由界面基线）、`surface.dashboard`（仪表盘）、`surface.gallery`（图鉴画廊）、`free3d`（three.js 基线）、`free3d.viewer`（OrbitControls 查看器）。从模板起步比从空白起步稳。
