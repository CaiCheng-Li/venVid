/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Verified against the captured Stable web bundle; desktop runtime validation is separate.
export const uploadPatch = {
    find: "Unexpected mismatch between files and file metadata",
    replacement: {
        match: /async function (\i)\((\i),(\i),(\i)\)\{(?=let\{filesMetadata:)/,
        // The function name is shadowed by a local variable in this build. Capture it outside the body.
        replace: "const venVidOriginalUpload=$1;$&const venVidPending=$self.intercept(venVidOriginalUpload,this,arguments);if(venVidPending)return venVidPending;"
    }
};
