# Noven image

English | [中文](README.zh.md)

The image tools and model-list route resolve credentials for each operation through `credentials`. A nonempty direct `apiKey` keeps precedence; otherwise `apiKeyEnv` names a shared credential reference, including the environment provider. Stored endpoint, model, output directory and credential-reference values remain unchanged. The matching runtime must mount `credentials`; a missing provider prevents plugin activation.

The existing settings page stages values until Save. A rejected credential write retains its draft even when an older key remains configured. Saving captures the submitted credential reference, so later edits cannot redirect that write. Changing the connection, discarding drafts, closing the page or unloading its plugin cancels model probes and rejects stale responses. Model fetching never saves settings.

`modelRequestTimeoutMs` controls the Host probe timeout and defaults to the previous 15000 milliseconds. The route accepts optional `base`, `apiKey` and `apiKeyEnv` strings, validates model responses, and returns identifiers without credential values. Generated and edited files check cancellation before writing.

From the repository root, run `vitest run --root plugins-noven/noven-image --config vitest.config.mts --configLoader native --maxWorkers 1`. The controller suite exercises injected actions; the provider suite exercises registered routes and tools with transport doubles. The shell's `tests/packed-runtime.mjs` verifies both clients against installed candidate packages. Reverting this group requires no data migration; literal keys remain outside settings responses. Provider presets and page redesign are separate product decisions.
