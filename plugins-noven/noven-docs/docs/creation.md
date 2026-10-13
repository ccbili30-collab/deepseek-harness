# 创作辅助能力

## 生图

```
generate_image { prompt, filename? }   → 生成并落盘到项目
edit_image { image, prompt, filename? } → 以图改图，结果存新 PNG
```

- 落盘后在 `attach_image_to_document` 插进文档，或挂为卡的资源/封面
- 生成失败如实报，别假装成功

## 内置技能（复杂创作流程）

产品捆绑的技能在技能列表里可查可调，两个目录包级的：

- **漫画**：`/draw-comic`（技能 `noven-draw-comic`）——把故事改编成分镜连续、作画统一、字模分离的漫画页
- **学习**：`/study`（技能 `noven-study`）——学习项目资料或指定参考，提炼可复用的设定、文风、画风、生图指南

这些是重型流程（有自己的指令包），调用时按技能指引走，别把它们当普通生图用。

## 产物去哪

- 章节、设定集、综述 → `register_work` 登记进创作库 / `register_workbench` 摆进工作台（见 `workbench`）
- 世界设定 → 进卡（`cards`）或实体库（`sidecar`）
- 图片 → 项目文件 + `attach_image_to_document` / 卡资源

**原则**：产出留在项目目录里（Finder 可见），登记进应用索引（UI 可见）——两头都要，只写文件不登记等于产出对界面隐身。
