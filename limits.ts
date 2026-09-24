/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filters, findByCodeLazy, mapMangledModuleLazy } from "@webpack";

import { isValidLimit } from "./attempt";

const FileLimits = mapMangledModuleLazy("getGuildMaxFileSize", {
    getUserGuildLimit: filters.byCode(".getUserMaxFileSize(")
}) as { getUserGuildLimit(guildId?: string): number; };

// The "2026-08-kestrel-ga" experiment that used to gate the raised floor has shipped, and its
// config module is gone from the bundle. Discord now raises every limit to a fixed floor
// unconditionally, in a one-line helper Math.max(<floor>, base) with no strings to key off.
// Matched by shape, requiring a large numeric literal so an ordinary clamp helper cannot
// collide and a future change to the floor value does not break the lookup.
const applyUploadFloor = findByCodeLazy(
    /^function \i\(\i\)\{return Math\.max\((?:0x[\da-fA-F]{6,}|\d{7,}),\i\)\}$/
) as (base: number) => number;

export function resolveLimit(guildId?: string): number | undefined {
    try {
        const limit = applyUploadFloor(FileLimits.getUserGuildLimit(guildId));
        return isValidLimit(limit) ? limit : undefined;
    } catch {
        return undefined;
    }
}

export function formatBytes(bytes: number) {
    return `${(bytes / 1048576).toFixed(2)} MiB (${bytes.toLocaleString()} bytes)`;
}
