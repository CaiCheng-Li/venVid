/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";

import { uploadPatch } from "./patches";
import { intercept, startAdapter, stopAdapter } from "./uploadAdapter";

const Native = VencordNative.pluginHelpers.VenVid as PluginNative<typeof import("./native")>;

export default definePlugin({
    name: "VenVid",
    description: "Preview, trim, and compress oversized video attachments to fit your upload limit.",
    authors: [],
    patches: [uploadPatch],
    start: startAdapter,
    stop: () => {
        stopAdapter();
        void Native.cleanupAllJobsIpc().catch(error => new Logger("VenVid").error("Temporary video cleanup failed", error));
    },
    intercept
});
