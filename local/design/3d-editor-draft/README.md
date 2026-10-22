# 3D 编辑器 · HTML 草稿

打开 [../3d-editor-draft.html](../3d-editor-draft.html)。单文件、自包含，three.js 已内联，不需要服务器或网络。

## 这版能试什么

- **默认一颗方块**，直接在场景里；左侧「添加」只给基础几何：方块、球体、圆柱、圆锥、圆环、平面、胶囊。
- **物体模式**：选中物体，W/E/R 拖 gizmo 移动/旋转/缩放；右侧改颜色、粗糙度、金属度、透明度。
- **网格模式**：选中方块/平面/圆柱/圆锥，左侧切「网格」，再选「点 / 边 / 面」。点模型上的元素选中，**Shift 点选多选**，拖 gizmo 移动、旋转、缩放整个选区。
- **面操作**：挤出（多选时按区域挤出）、内插（每个面独立）、面倒角（内插后沿法线抬起）、细分（面心三角细分，不是 Catmull-Clark）、桥接（两个边数相同的面连成管壁）。
- **边操作**：真边倒角（切掉一条边，生成新的斜切面，端点沿面的扇区收口）、环切（选一条边，沿闭合四边面环切一圈，切完自动选中新环，可直接拖 gizmo 缩放）。
- 边倒角一次只能选一组**互不相邻**的边；共享顶点的边会被拒绝，避免产生破面。
- 撤销/重做（⌘Z / ⇧⌘Z）、保存到 localStorage、预览（Esc 退出）。
- 「导入」读自包含 `.glb` / `.gltf`，只做摆放，不做网格编辑；仅本次会话保留。
- 窄窗口用顶栏「工具 / 属性」打开左右抽屉，点遮罩关闭。

## 边界

- 网格编辑目前支持 **方块 / 平面 / 圆柱 / 圆锥**；球体、圆环、胶囊只支持物体变换。
- 边倒角：边界边、非流形边、共享顶点的多选会被拒绝；还不支持把一整圈环切边一次倒角（需要真 miter 倒角）。
- 环切：只切**闭合的四边面环**；碰到三角面/多边面（例如圆锥侧面）会整次拒绝，不留 T 形接缝。
- 桥接：只接受两个不共顶点、边数相同、且没有被现有侧面连起来的两个面；否则会生成重复面或非流形边，直接拒绝。
- 没有布尔、雕刻、绑骨、动画；这些去 Blender。
- 不是完整 DCC：这里做体块、面片、挤出/内插/面倒角/面心细分/边倒角/环切/桥接；深度建模交给 Blender，再导入 `.glb`。

## 源码与重新构建

- `src/app.js`：编辑器逻辑（物体/网格、选择、检查器、历史、导入）。
- `src/style.css`：产品浅色/薄荷绿的草稿皮肤。
- `src/index.template.html`：单文件模板。
- `src/three-draft.js`：three + OrbitControls + TransformControls + GLTFLoader 的 ESM bundle。
- `src/app.bundle.js`：app.js 的 IIFE bundle（构建产物）。
- `../3d-editor-draft.html`：内联后的单文件。

重新构建（在仓库根目录）：

```sh
# 1. three 草稿运行时（在装有 three 的插件目录里执行）
cd plugins-noven/noven-shell
cat > .draft-three-entry.mjs <<'JS'
export * from 'three'
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
export { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
JS
ESBUILD=../../node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild
$ESBUILD .draft-three-entry.mjs --bundle --format=esm --minify --legal-comments=none \
  --outfile=../../local/design/3d-editor-draft/src/three-draft.js
rm .draft-three-entry.mjs

# 2. 应用 bundle + 内联
cd ../../local/design/3d-editor-draft
$ESBUILD src/app.js --bundle --format=iife --minify --legal-comments=none --outfile=src/app.bundle.js
python3 - <<'PY'
from pathlib import Path
tpl = Path('src/index.template.html').read_text()
css = Path('src/style.css').read_text()
js = Path('src/app.bundle.js').read_text().replace('</script', '<\\/script')
Path('../3d-editor-draft.html').write_text(tpl.replace('/*__STYLE__*/', css).replace('/*__SCRIPT__*/', js))
PY
```
