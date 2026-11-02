# Noven Web 与打包 macOS 镜像

[English](web-pc-mirror.md) | 中文

## 目标与边界

默认 Noven Web 反向采用打包 macOS 的普通窗口呈现：同一份共享 renderer、同一套 Noven 默认布局、对象顶栏、导航语义和动效。PC 不为了迁就 Web 删除能力，Web 也不另养一套简化界面。

镜像不等于数据同步。Web、Noven Test 和正式版分别使用自己的 Host 数据、项目目录和 origin-local 布局存储；切换模式、折叠状态和用户内容不会跨实例自动复制。项目文件夹仍由用户决定。

## 平台事实与呈现事实

- `data-platform="darwin"`：只由真实 Electron preload 发布，表示真实 macOS Desktop。快捷键 runtime、原生 drag watcher、`-webkit-app-region`、preload 和 Host 路径桥只认这个事实。
- `data-chrome-platform="darwin"`：Noven Web 在首次挂载前设置的呈现标记。它只参与布局和视觉规则，不改变运行平台，不创建 Electron bridge，也不发布 `data-fullscreen`。
- `data-fullscreen`：只由真实 macOS 窗口状态发布。Web 镜像固定参考普通窗口，不用浏览器 Fullscreen API 或窗口尺寸猜测原生全屏。

普通窗口共享整栏隐藏、52px 侧栏顶带、48px 顶部 clearance、88px leading 起点、Noven 196px 安全区、右栏 inset、配色、菜单材质和恢复入口。Web 的三点灯是无交互装饰，用来保留空间参照；真实 Desktop 不渲染这份副本。

## 能力对照

| 范围 | Web 与 PC 的关系 | 不能冒充的验收 |
|---|---|---|
| Agent／手作、对象顶栏、会话列表、画布页签与工具 | 共享源码和行为 | 真实 Mac 视觉仍由打包候选确认 |
| 整栏折叠、辅助区折叠、恢复入口、普通窗口标题栏几何 | 共享呈现规则 | 原生全屏的 12/120 状态只在真机验收 |
| 模式换位、页签、菜单和折叠动效 | 共享时长、曲线、保活和 reduced-motion | 原生窗口进入／退出全屏、最小化、Dock 恢复不在页面内 |
| 侧栏透明链与 vibrancy | 使用同一渐变和 token；Web 使用确定性的页面底色 | NSVisualEffectView 的真实材质、壁纸混合和 Reduce Transparency 像素 |
| 三点灯 | Web 静态装饰 | 关闭、最小化、原生全屏按钮及悬停行为 |
| 快捷键 | 展示并执行真实 Web 键位，常见为 Option+Command | 不显示或伪造 Desktop 的 Command 单键、系统菜单和全局快捷键 |
| 目录选择、Open In、Finder reveal | 可走真实 Node Host；本机 Web 可得到同类结果 | 对话框父窗口、焦点、取消语义；远程浏览器操作的是 Host 文件系统 |
| 文件拖入 | Web 使用实际上传 | Desktop 的本地路径引用不伪装成 Web 已具备 |
| 导出与下载 | 共享 Blob 和文件内容生成逻辑 | 浏览器下载目录、权限、Save As 和系统下载 UI |
| 标签页与窗口生命周期 | Host 和持久数据可以恢复 | 关闭浏览器标签页不等于 Desktop 关窗保留同一 document 和运行现场 |
| 系统菜单、Dock、托盘、单实例、协议唤起 | 不伪造 | 只能由原生应用验收；协议 deep link 还要按自身实现状态单列 |
| 签名、Gatekeeper、DMG、安装、卸载、覆盖升级 | 不属于 Web | 只能由分发包和 macOS 验收 |

## 数据隔离

- Web：仓库 `.data/harness`、`.data/library`、`.data/projects`，端口 3083。
- Noven Test：独立的 `Noven Test` 数据根；未提供便携 `.data` 时位于 `~/Library/Application Support/Noven Test`。
- 正式 Noven：`~/Library/Application Support/Noven`，不作为测试数据根。

`启动诺文.command` 从自身位置定位仓库，显式设置 Web 的三个数据根，复用 `apps/desktop/noven/profile/cordis.patch.yml` 的 Noven 默认功能声明。已有端口服务时只复用；缺少构建、启动失败或地址不可访问时停止，不循环启动第二套实例。

## 验收口径

1. Web 与打包候选必须来自同一源码状态；分别构建，不拿旧 DMG 对照新 Web。
2. Web 做真实浏览器行为、DOM 几何、模式保活、动效中断、reduced-motion 和负向平台检查。
3. 打包 Mac 做真实窗口视觉、原生全屏、窗口拖拽、菜单、生命周期和分发验收。Web 截图不能替代这些证据。
4. 浏览器外层地址栏和标签栏不属于 renderer 镜像范围；原生窗口外框也不由 Web 假装拥有。
