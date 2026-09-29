# 诺文 Schema v1 草稿（2026-09-29，待老板过目）

> 定位：`.noven/` 目录下所有共享文档的**轻装版 v1 契约**。两端共享——模型用工具写，桌面 UI 用面板读，谁都不许手改文件本身。
> 范围纪律：显式因果字段**不做**（`/causality` 已砍，连带缓置）；growth 系字段不进 v1。

## 设计原则

1. **一份文件一个事实源**：模型侧工具和客户端 UI 读写同一份 JSON，不搞双通道。UI 需要写的能力（如批注）走宿主路由，仍落在同一目录树下。
2. **坐标用分数**：批注/锚点坐标一律 0..1 分数，与显示尺寸解耦，缩放无损。
3. **version 字段钉死 1**：读到不认识的 version 当损坏处理（注册表容错回空，批注路由 422/500 拒写），不猜格式。
4. **id 就地现铸**：`mintId`（标题 slug + 时间36进制）与 `a-<时间>-<随机>`，不依赖全局序列。

## 文档 1：`.noven/workbenches.json`（工作台注册表，已实现）

```jsonc
{
  "version": 1,
  "workbenches": [
    {
      "id": "研究-1a2b3c",        // mintId(title)：slug + Date.now().toString(36)
      "title": "研究",            // 显示名（rename_workbench 可改）
      "folder": "研究",           // 相对项目根的成果目录
      "home": "index.md",        // 可选；打开工作台先展示的文件（相对 folder）
      "visible": true,           // 隐藏不注销
      "pinned": ["研究/地图.png"] // 可选；置顶展示，相对项目根，最多 16 条
    }
  ]
}
```

- 写者：`register/rename/unregister/set_home/set_visibility/show_in_workbench` 六工具（temp+rename 原子写）。
- 读者：诺文展厅 tab（`noven.workbench`）；`workspaceFiles` RPC 读，损坏容错为空表。

## 文档 2：`.noven/annotations/<图片相对路径>.json`（批注 sidecar，已实现）

路径镜像图片位置：`视觉/x.png` → `.noven/annotations/视觉/x.png.json`。

```jsonc
{
  "version": 1,
  "image": "视觉/x.png",         // 必须与路由参数一致，服务端强制
  "annotations": [
    {
      "id": "a-m3x9k1-7f2a",     // 客户端现铸
      "x": 0.12, "y": 0.34,      // 左上角，图片宽高的分数
      "w": 0.30, "h": 0.18,      // 宽高分数，>0
      "text": "这里的光不对",     // ≤500 字
      "created": 1760000000000   // epoch ms
    }
  ]
}
```

- 写者：`POST /api/noven-annotations?session=&image=`（noven-workbench 宿主路由；路径围栏禁 `..`/绝对路径；≤100 条/图；temp+rename）。
- 读者：同路由 GET；展厅图片台的批注模式。
- 未来的"批注回流文档"（旧版特性）如要恢复，走 `attach_image_to_document` 同源思路，不改本契约。

## 卡片（展示单元）的约定

卡片不是独立文件——**工作台目录里的一个文件就是一张卡**：

- 图片卡：png/jpg/jpeg/gif/webp/svg/bmp/avif，缩略图即文件本身（`/api/file` 伺服）
- 文档卡：其余文件，点击经 `dsh-resource://file/session/<sid>/<相对路径>` 交给标准预览器（Markdown/HTML/PDF/Office 由底座白送）
- 置顶 = 注册表 `pinned`；首页 = `home`（文档卡带 ★ 标）

`/draw-map`、`/draw-comic`（第 5 步迁入）产出物同样落为工作台目录里的文件（地图 HTML/漫画图组），**不新增卡片段落**——这是 v1 与旧版最重的减法。

## 待老板拍板

1. 批注 sidecar 放 `.noven/annotations/` 镜像树（对用户隐形）还是图片旁 `<名>.anno.json`（对 git 可见）？现实现取前者。
2. `pinned` 上限 16 条是否够用？
3. `/draw-map` 的地图是否需要独立 `kind` 字段（影响第 5 步要不要扩 schema）？倾向不扩。
