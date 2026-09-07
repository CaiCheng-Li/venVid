/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filters, mapMangledModuleLazy } from "@webpack";

import { isValidLimit } from "./attempt";

const FileLimits = mapMangledModuleLazy("getGuildMaxFileSize", {
    getUserGuildLimit: filters.byCode(".getUserMaxFileSize(")
}) as { getUserGuildLimit(guildId?: string): number; };

const EffectiveLimits = mapMangledModuleLazy("2026-08-kestrel-ga", {
    getConfig: filters.byCode(".getConfig(", "isGA:"),
    applyConfig: filters.byCode(".enabled?Math.max(")
}) as {
    getConfig(options: { location: string; }): unknown;
    applyConfig(config: unknown, base: number): number;
};

export function resolveLimit(guildId?: string): number | undefined {
    try {
        const base = FileLimits.getUserGuildLimit(guildId);
        const config = EffectiveLimits.getConfig({ location: "web.filesExceedUploadLimits" });
        const limit = EffectiveLimits.applyConfig(config, base);
        return isValidLimit(limit) ? limit : undefined;
    } catch {
        return undefined;
    }
}

export function formatBytes(bytes: number) {
    return `${(bytes / 1048576).toFixed(2)} MiB (${bytes.toLocaleString()} bytes)`;
}
