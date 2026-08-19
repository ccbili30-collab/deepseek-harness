# Agent Note: Out-of-process recovery checkpoints

Status: implemented

English | [中文](2026-08-19-out-of-process-recovery.zh.md)

## Problem

DeepSeek Harness can be changed at two control planes: the checked-out or installed source tree, and the profile manifests and patch files under `DSH_HOME`. A malformed patch, an incompatible plugin, or an accidental source edit can prevent the ordinary Host and its Web plugins from starting. A recovery feature implemented only as another Host or Client plugin would then share the failure boundary it is meant to repair.

The user-data tree also contains credentials, sessions, attachments, and workspace content. Treating all of `DSH_HOME` as one restorable image would make a configuration rollback silently revert conversations or replace secrets. Conversely, a snapshot stored inside `DSH_HOME` can disappear or become unreadable with the damaged installation.

## Decision

Add a recovery mode to the distributed `dsh` launcher. Argument parsing dispatches this mode before importing application boot, profile composition, Cordis, or any plugin package. Its implementation uses only Node built-ins and remains callable when the ordinary DSH startup graph is invalid.

Recovery checkpoints live in a separate recovery root, outside both the source tree and `DSH_HOME`. Each immutable checkpoint contains a versioned manifest, SHA-256 hashes, source identity, and copied files. The default scope contains:

- source files tracked by Git plus non-ignored untracked source files;
- top-level `cordis.patch.yml` and `settings.yaml` under `DSH_HOME`;
- each profile's `package.json`, `cordis.patch.yml`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.

Credentials, environment-secret files, sessions, attachments, storages, generated dependencies, and ordinary workspace content are excluded by policy rather than merely by a default glob. A later extension may add explicit, separately named data-backup scopes, but a recovery checkpoint must never imply that it protects those data classes.

Creating a checkpoint writes into a temporary directory and publishes it with one rename only after every copied file matches its manifest hash. Restoring first verifies the selected checkpoint, checks that the requested source and `DSH_HOME` match its recorded identities, and creates an automatic rescue checkpoint of the current state. Restore writes are confined to manifest-declared control-plane paths, use same-directory temporary files and atomic renames, and require an explicit confirmation token. The first implementation restores source checkpoints only onto the Git commit from which they were captured; version migration is a separate operation.

The Web recovery center is a thin client of this recovery boundary. Its sidebar-footer power menu—beside Settings when expanded and above it on the rail—contains only create, restore-latest, and clean-shutdown actions. The Settings Recovery page owns checkpoint history, path details, verification, arbitrary selection, and exact-id confirmation. The quick restore shows the selected latest id and requires a second explicit confirmation. Neither surface owns snapshot storage or file mutation. Every Remote in the recovery namespace is pinned to loopback even when the Web deployment trusts a LAN authority.

The Host starts a detached guardian before requesting bounded shutdown. The guardian waits for the Host process to exit, runs the already-loaded recovery implementation, creates the rescue checkpoint, restores the selected state, and restarts the exact launcher invocation. The command-line recovery mode remains the manual entrance when the ordinary Web tree cannot boot.

## Alternatives considered

**Implement recovery as an ordinary DSH plugin.** This is easy to distribute and can provide the desired UI, but it cannot recover a Host that fails before the plugin applies. It remains useful only as a front end.

**Depend on an existing startup-guard plugin.** Existing community projects demonstrate boot markers, profile backups, rescue pages, or an external guardian. Their recovery scopes and startup guarantees differ, and some run plugin code or repair session files while diagnosing startup. The core recovery path instead adopts the useful design ideas without a third-party runtime dependency or automatic session mutation.

**Use Git alone.** Git is suitable for source history but does not own profile manifests under `DSH_HOME`, cannot represent a user's installed plugin state by itself, and is too easy to invoke destructively from a recovery UI. Recovery records Git identity while using an independent immutable checkpoint format.

**Copy all of `DSH_HOME`.** This produces a superficially complete image but couples configuration rollback to conversation, credential, and workspace rollback. Those data require their own retention and consent policy.

**Maintain two complete DSH installations.** Separate development and daily-use installations are valuable for blast-radius isolation, but duplication does not provide named history, integrity verification, or a safe way to recover the active copy. The recovery store complements, rather than replaces, isolated installations.

## Testing

- `dsh recovery` parses and executes without importing DSH boot, profile, Cordis, or plugin modules.
- Create, list, and verify operations work against explicit source, `DSH_HOME`, and recovery-root paths in a keyless real-process test.
- A checkpoint is not visible until its manifest and every payload hash verify, and an interrupted creation leaves no selectable checkpoint.
- Default checkpoints include the documented source and profile control-plane files and mechanically exclude credentials, secret environment files, sessions, attachments, storages, dependency trees, and workspaces.
- Restore rejects a mismatched source commit, mismatched roots, corrupt payload, missing confirmation, and path traversal before mutating the target.
- Restore creates and verifies a rescue checkpoint before the first target write; a focused destructive test proves that an erroneous source edit and profile plugin edit can be recovered.
- Restore never writes outside the selected source tree and `DSH_HOME`; its report gives the restored file count and follow-up dependency-install state, while documentation names intentionally excluded data.
- The sidebar-footer Web entry stays visible with zero checkpoints, keeps only three power actions, and delegates restore to a detached guardian that stops and restarts the Host; exact-id management remains in Settings.
- Recovery Remotes are loopback-only, including on a deployment with declared trusted LAN authorities.
- English and Chinese CLI/recovery documentation describe the same scope, exclusions, guardian path, and manual fallback.

## Consequences

Direct CLI restoration cannot make a concurrently running Host quiescent, so it requires `--offline` and defends each mutation with recorded preconditions. The Web path instead delegates to the guardian before requesting Host shutdown; the guardian does not restore until the original PID has exited.

Restoring profile manifests may leave an incompatible `node_modules` tree. The recovery report makes that dependency-reconciliation state explicit; the guardian deliberately does not run a package manager automatically in this release.

A launcher stored only inside a mutable source checkout can be damaged together with that checkout. The first mode establishes the import-independent boundary; packaging a small known-good launcher into the external recovery root is required before the feature can claim recovery from deletion of the installed CLI itself.
