/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function calculateBitrate(
    duration: number,
    targetBytes: number,
    removeAudio: boolean
): { videoBps: number; audioBps: number; isValid: boolean } {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isSafeInteger(targetBytes) || targetBytes <= 0) {
        return { videoBps: 0, audioBps: 0, isValid: false };
    }
    const safetyFactor = 0.97;
    const audioBps = removeAudio ? 0 : 128000;
    const videoBps = Math.floor((targetBytes * 8 * safetyFactor) / duration) - audioBps;
    return {
        videoBps,
        audioBps,
        isValid: videoBps > 0
    };
}

export function estimateOutputSize(duration: number, videoBps: number, audioBps: number): number {
    return Math.floor((videoBps + audioBps) * duration / 8);
}
