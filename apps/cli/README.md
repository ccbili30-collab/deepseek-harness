# `@deepseek-ai/dsh`

English | [中文](README.zh.md)

The `dsh` command is the product launcher for profiles: ordered stacks of plugin-bundle patch layers under the user's own overrides. [`src/args.ts`](src/args.ts) owns the command grammar, and [`src/bin.ts`](src/bin.ts) loads only the selected runner. Invalid commands, options from another mode, configuration errors, and boot failures exit nonzero.

## Entry modes

| Command | Purpose |
|---|---|
| `dsh --profile <name>` | Boot the named profile under `$DSH_HOME/profiles/<name>`. |
| `dsh --profile headless "job"` | Run one fresh persisted session, print the final answer, and exit. |
| `dsh web` | Alias of `--profile web`. |
| `dsh plugin --profile <name> <pnpm args>` | Manage a profile's plugins by forwarding to pnpm in the profile directory. |
| `dsh recovery <command>` | Create, verify, and restore boot-independent recovery checkpoints. |

The invoking directory is the default workspace root. The `web` and `headless` profiles auto-initialize on first use from shipped templates; any other profile must be created through `dsh plugin`.

## App arguments

The launcher parses only its own flags and hands everything after them to the booted profile, where any injected app plugin may parse the shared immutable snapshot ([`dsh-cmdline`](../../packages/boot/cmdline/README.md)). Launcher flags therefore come first, and the first token the launcher does not recognize starts the app's arguments:

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

## Profiles

A profile directory holds a `package.json` (out-of-tree plugin dependencies plus the profile manifest `dsh.profile` with its ordered `bundles` list) and a `cordis.patch.yml` (the user's own patch layer).

The tree composes over an empty root:
- each bundle's patch in `dsh.profile.bundles` order
- then the profile's `cordis.patch.yml`, then the home-level `$DSH_HOME/cordis.patch.yml`
- then `--patch` overlays

Bundles named in `dsh.profile.bundles` resolve from the dsh installation first (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`), then from the profile's own `node_modules`, where pnpm installs out-of-tree plugins.

Use `--dump-default-config` and `--dump-config` to inspect the composed tree without booting it.

## Recovery checkpoints

`dsh recovery` runs before the launcher imports application boot or any plugin. Its external store defaults to `$DSH_RECOVERY_HOME` or `~/.dsh-recovery`; the store must be separate from both the source checkout and `DSH_HOME`.

```sh
dsh recovery create --source /path/to/deepseek-harness --label "before installing a plugin"
dsh recovery list
dsh recovery verify <checkpoint-id>
dsh recovery restore <checkpoint-id> --source /path/to/deepseek-harness --confirm <checkpoint-id> --offline
```

A checkpoint captures the Git source checkout plus DSH control files: top-level `settings.yaml` and `cordis.patch.yml`, and each profile's package, patch, lock, and workspace manifests. It deliberately excludes credentials, `.env` secrets, sessions, attachments, storages, dependency trees, and workspace content. Restore therefore rolls back code and plugin configuration without rolling back new conversations or replacing newly rotated credentials.

Pass the DSH checkout explicitly with `--source`, or set `DSH_SOURCE_HOME`; a local source launch publishes its checkout automatically. Direct CLI restore requires the DSH Host to be stopped. Restore verifies the selected checkpoint, requires the same source Git commit and recorded roots, then creates a verified rescue checkpoint before writing. A restored profile manifest can disagree with its existing `node_modules`; the command reports that dependency reconciliation is required.

The Web profile mounts a compact power menu beside Settings in the expanded sidebar footer (and above Settings on the collapsed rail). It offers only create checkpoint, restore latest checkpoint, and clean shutdown; checkpoint history, verification, path details, and exact-id restore live in the Settings "Recovery" page. The loopback-only Host bridge starts a detached guardian, requests bounded shutdown, restores only after the Host PID exits, and restarts the original invocation. The browser is a front end, not the recovery authority: use the CLI path if the ordinary profile cannot boot.

The [CLI behavior reference](reference/README.md) owns exact layer precedence, recovery scope, flags, shutdown behavior, deployment defaults, and source execution.

## Development

Production runs require built package and frontend artifacts. From the repository root, run `pnpm run build` separately, then use `pnpm dsh <args...>` to run the TypeScript entry and forward every argument; the [source-execution reference](reference/README.md#source-execution) owns the module-resolution contract.
