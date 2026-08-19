# @deepseek-ai/dsh-host-recovery

[English](README.md) | 中文

连接运行中 Host 与可独立启动的 `dsh recovery` CLI 的本机回环专用桥梁。它可列出、创建和校验不可变检查点；触发恢复时，会先启动脱离当前进程的 guardian，再通过 `ctx.appExit` 请求有边界的 Host 关停；独立的安全关机操作则不会启动替代进程。

guardian 会等待当前进程完全退出，校验并恢复所选检查点，自动创建一份恢复前救援检查点，然后按原启动命令重启。恢复载荷始终位于源码目录与 `DSH_HOME` 之外；本包不会复制凭据、会话、附件、存储数据、工作区或已安装依赖。

## 模型体验

无，因为本 Host 控制面不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- 首版面向本地下载的 Git checkout。打包安装需要设置 `DSH_SOURCE_HOME` 才能启用源码回档。
- 恢复 profile manifest 时会报告需要重新协调依赖；guardian 不会自动运行包管理器。
