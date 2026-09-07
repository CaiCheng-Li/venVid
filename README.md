# VenVid

Private Vencord plugin under development. Phase 1 is an attachment integration proof, with compression and trimming planned for later phases.

The proof detects one oversized video in an attachment batch, reads Discord's current effective per-file limit, and offers a generated one-second blue MP4 as a test replacement. The test clip is **not a compressed version of the original**. No, Escape, and closing the modal continue the original attachment operation once. Discord can still reject that original file. Multiple oversized videos currently continue normally; batch editing belongs to Phase 4.

Accepted replacements return through the original upload function with the captured destination, draft type, argument receiver, metadata, and file order. The plugin excludes instant-send and thumbnail operations. It does not call the message-send API. Disabling the plugin invalidates pending attempts without attaching files; select those files again after restarting. Source patches require a full client restart.

## Development

This repository is the only editable plugin source. Its sibling `Vencord/` is the development checkout. Use Node >=22 and the checkout's pinned pnpm version (currently 11.9.0 via Corepack). The verified Vencord revision is `0e40e433d7aa9168f656aba733d01e761b7ca8ca`.

From the **Vencord checkout root**, run:

```powershell
& ../venVid/sync.ps1
corepack pnpm exec tsx --test ../venVid/tests/attempt.test.ts ../venVid/tests/uploadAdapter.test.mjs
corepack pnpm testTsc
corepack pnpm exec eslint src/userplugins/venVid --max-warnings 0
corepack pnpm exec stylelint 'src/userplugins/venVid/**/*.css'
corepack pnpm build
```

The explicit sync copies runtime source, documentation, and the license into `src/userplugins/venVid/`. Never edit the build copy. The checkout's TypeScript include covers custom plugins, while its ordinary CSS lint script excludes them; use the explicit command above. Building does not install or inject the result into Discord.

The author's Discord account ID has not been supplied, so the plugin's account attribution list is empty. Source copyright identifies Caicheng Li.

## Integration evidence and live acceptance

See [PHASE-1.md](PHASE-1.md). Static source verification and build checks do not establish live Discord compatibility. Live checks are required before Phase 1 can pass:

1. Load the development build in the authorized target client and enable VenVid; restart fully and inspect patch diagnostics.
2. Try an oversized video through picker, drop, and paste. Each must show exactly one prompt before Discord rejects it. No/Escape must reproduce normal Discord behavior once.
3. Accept, generate the tiny blue test clip, play the preview, and attach. Confirm one replacement reaches the original draft without sending a message.
4. Repeat with a passing image in the same batch; confirm order and existing text/reply survive. Check spoiler/description metadata when the input path supplies it.
5. Change channels while the modal is open; confirm the replacement returns to the captured channel. Test missing destination/attachment permission and an updated limit.
6. Test below/equal/above per-file limits, concurrent attempts, modal close, plugin shutdown, and attachment-button plugin coexistence. Report unavailable contexts as untested.

Instant-send operations, thumbnails, multiple oversized videos, and full editor/encoder behavior are outside this proof. Aggregate size and attachment-count rejection still belongs to Discord's original validator.

## License

GPL-3.0-or-later; see [LICENSE](LICENSE).
