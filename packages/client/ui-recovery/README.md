# @deepseek-ai/dsh-client-ui-recovery

English | [中文](README.zh.md)

The Recovery Center is an always-visible power-style action beside Settings in the expanded sidebar footer and above Settings on the collapsed rail. Its compact menu intentionally contains only create checkpoint, restore latest checkpoint, and clean shutdown. The Settings "Recovery" section owns checkpoint history, storage/source paths, payload verification, checkpoint selection, and exact-id restore confirmation.

Quick restore shows the latest published checkpoint and requires a second explicit confirmation; arbitrary checkpoint selection requires typing the complete id in Settings. The browser never edits files itself: it calls the loopback-only `recovery` Remote, which hands execution to an out-of-process guardian before the Host shuts down. Clean shutdown uses the launcher's bounded `appExit` path without starting a replacement process. The power menu remains available when there are no checkpoints so the safe first action is always discoverable.

## Model Experience

None, as this browser UI registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- The panel currently labels new checkpoints with a fixed manual label; custom labels remain available through the CLI.
- Dependency reconciliation after restoring profile manifests remains a reported manual follow-up.
