/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { PluginNative } from "@utils/types";

import { uploadPatch } from "./patches";
import { intercept, startAdapter, stopAdapter } from "./uploadAdapter";

const Native = VencordNative.pluginHelpers.VenVid as PluginNative<typeof import("./native")>;

export default definePlugin({
    name: "VenVid",
    description: "Video attachment integration proof. Compression and trimming are not implemented yet.",
    authors: [],
    patches: [uploadPatch],
    start: startAdapter,
    stop: () => {
        stopAdapter();
        Native.cleanupAllJobsIpc();
    },
    intercept
});
