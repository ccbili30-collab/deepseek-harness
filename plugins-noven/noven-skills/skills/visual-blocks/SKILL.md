---
name: visual-blocks
description: "在回复正文中组合 Noven 预置组件：角色对话、旁白、剧情帧、图集、配色、选项、设定修订和轻量图表。无需创建文件或模块。"
---

# 回复里的内联组件

`code` 是当前消息的一部分，不是文件或卡。模型只写组件名称、参数、文字、数据和现有资源路径，Noven 负责稳定渲染。

## 何时使用

- 轻量表达：`text`、`media`、`icon`、`stack`、`split`、`frame`、`badge`。
- 角色与叙事：`dialogue`、`narration`、`story-panel`、`canon-diff`。
- 视觉：`media-grid`、`palette`。
- 用户裁决：`choices`、`conflict-list`。
- 数据：`stat`、`meter`、`bar-chart`、`line-chart`、`radar-chart`。

完整角色档案、集合、时间线、关系、地图、场景、HTML、3D 或文档界面直接引用现有 `module`，不要用 `code` 重做。

## 输出方式

1. 从系统提示的当前组件目录选择组件和字段。
2. 需要组合时，根节点使用 `stack`，按阅读顺序放入 `children`。
3. 在最终回复中单独一行输出完整指令，不加代码围栏，不在同一行写其他文字。

```text
::view{"block":"code","data":{"version":1,"component":"stack","children":[{"component":"text","text":"阿七第一次出场。"},{"component":"dialogue","turns":[{"speaker":"阿七","role":"修钟匠","portrait":"characters/aqi/stern.png","text":"别碰那根指针。"}]},{"component":"choices","group":"剧情分支","options":[{"id":"trust","label":"相信阿七"},{"id":"test","label":"要求证明"}]}]}}
```

## 约束

- 不创建工作区 HTML、卡片、模块或临时展示文件。
- 不输出 HTML、CSS、JavaScript、SVG 源码、任意样式或 base64 图片。
- 图片使用工作区已有的相对资源路径；文字可含安全 Markdown。
- 指令必须完整。流式输出没有封闭时，宿主不会把它当成块。
- 组件数量以阅读需要为限，不把回复变成组件陈列。
- 选项只进入用户下一条消息。不要声称点击本身已经修改设定、文件或模型状态。
