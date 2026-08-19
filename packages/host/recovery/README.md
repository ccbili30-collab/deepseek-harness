# @deepseek-ai/dsh-host-recovery

English | [中文](README.zh.md)

Loopback-only Host bridge to the boot-independent `dsh recovery` CLI. It lists, creates, and verifies immutable checkpoints, schedules a restore by starting a detached guardian before requesting bounded Host shutdown through `ctx.appExit`, and exposes a separate clean-shutdown action that starts no replacement process.

The guardian waits for the current process to stop, verifies and restores the selected checkpoint, creates an automatic pre-restore rescue checkpoint, and restarts the exact launcher invocation. Recovery payloads remain outside both the source checkout and `DSH_HOME`; this package never copies credentials, sessions, attachments, storage data, workspaces, or installed dependencies.

## Model Experience

None, as this Host control plane registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- The first release targets a locally downloaded Git checkout. Packaged installations must set `DSH_SOURCE_HOME` to enable source rollback.
- Restoring a profile manifest reports that dependency reconciliation is required; the guardian does not run a package manager automatically.
