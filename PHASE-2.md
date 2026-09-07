# Phase 2: native media service

Status on 2026-09-07: Phase 2 is complete.

## Implemented

- `native.ts` native IPC bridge defining narrow file transfer, job management, probing, and encoding methods.
- `native/jobs.ts` for safe temporary directory usage, job tracking, and process cancellation. Includes renderer stop invalidation (`cleanupAllJobsIpc`).
- `native/media.ts` utilizing `ffprobe` to identify media duration, streams, and safety constraints.
- `native/encoder.ts` for two-pass FFmpeg H.264/AAC encoding with target bitrate calculation based on desired duration, target bytes, and audio state, automatically scaling to even dimensions.

## Validation

- Type checking, linting, and desktop build are fully green (`pnpm testTsc`, `eslint`).
- Evaluated against `evidence/venvid-oversized.mp4` via custom native test scripts (`test-native.ts`, `test-cancel.ts`), verifying chunk staging, media probe results, encoding success, bitrate targeting, and active process cancellation.

No UI components from Phase 3 are implemented yet.
