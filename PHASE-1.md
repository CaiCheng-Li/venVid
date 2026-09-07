# Phase 1: integration proof

Status on 2026-09-07: implementation ready for live acceptance; the phase's runtime gate is still pending. Phase 2 has not started.

## Implemented

- One source patch at the start of Discord's original upload function, before its first await, preprocessing, or size rejection.
- An effective limit resolver using Discord's user/guild resolver and experiment adjustment, with integer-byte comparison and equality accepted.
- Deferred confirmation and a generated, previewable test MP4. Cancel/No/Escape resume the original operation once; accepted replacement returns through the original draft path.
- Per-attempt bypass, original receiver/arguments, destination, draft type, file ordering, metadata, permission/limit revalidation, and shutdown invalidation.
- An explicit source-to-checkout sync and a desktop build that includes VenVid.

The proof intentionally offers a blue test clip rather than the later compression/editor UI. Multiple oversized videos, native encoding, full batch editing, and preview proxies are deferred to their planned phases. Unknown integration state and unsupported input shapes continue normally. Instant-send and thumbnail paths are excluded.

## Source evidence

Vencord revision: `0e40e433d7aa9168f656aba733d01e761b7ca8ca`.

Public Discord Stable source retrieved on 2026-09-07:

- Build number: `607562`.
- Build ID: `f9b13d9eaa95f75e952091b9150d0d2881c02b5d`.
- [Bundle](https://discord.com/assets/web.f803cc09a978437c.js).
- Bundle SHA-256: `a74ba599676144a1d1290ec543ce5d7080ea34e09b7e0700cafb47dd01aefda4`.
- Upload factory `518960`, upload validation `382287`, user/guild limit `453771`, effective experiment adjustment `550642`.

The upload function is already async in this build, contrary to the plan's initial synchronous-function caution. Its Promise contract is preserved. Its function name is shadowed by a local variable, so the patch captures the original function in the enclosing factory before entering the body.

The patch and resolver anchors each select one captured factory. The upload replacement matches once after applying Vencord's own normalization. The transformed factory parses and executes with controlled Discord dependencies: the real generated MP4 reaches `addFiles` once at the captured destination/draft; decline reaches the original oversize-error branch once. The test prohibits calls to `sendMessage`.

This is captured-source evidence, not a live client test. The checked public bootstrap bundles did not expose picker/drop/paste callers of this lazy upload path; tracing those callers in the actual target client remains part of the gate. The installed desktop build may differ.

## Validation

- 15 Node tests cover byte thresholds, video classification, one-use continuation, errors, cancellation/shutdown races, concurrent attempts, mixed file ordering, argument/metadata preservation, unknown/changed limits, lost destination/permission, and failed modal setup.
- Captured-source patch normalization, unique matches, syntax, async behavior, replacement and decline branches pass.
- Desktop build, TypeScript, targeted ESLint and explicit custom-plugin CSS lint pass.
- The 1,838-byte test asset probes as a 32x32, one-second H.264/yuv420p MP4 and fully decodes with FFmpeg.
- Live picker/drop/paste, actual account/guild limits, Discord playback, channel switching, attachment-button plugin compatibility, and real draft insertion: **not tested**.

Run the source-evidence check from the Vencord checkout root when the local capture is available:

```powershell
corepack pnpm exec tsx ../venVid/tests/verify-discord-source.ts ../evidence/modules.json
```

Local downloaded bundles and discovery scripts are kept in the enclosing workspace's `evidence/` directory, outside this repository. No Discord client installation, settings, or messages were changed. No commits or pushes were made.

## Remaining gate

Discord Stable and an existing Vencord installation were found, but no running Discord process was available during implementation. Loading the development bundle and performing the [README runtime checklist](README.md#integration-evidence-and-live-acceptance) need the user's runtime go-ahead. Do not mark Phase 1 accepted or begin Phase 2 until the live results have been reviewed and the user authorizes the next phase.
