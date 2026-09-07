/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface EncodeOptions {
    duration: number;
    targetBytes: number;
    audioRate: number;
    trimStart: number;
    trimEnd: number;
    removeAudio: boolean;
    resolution?: "1080" | "720" | "480" | "360" | "240" | "144";
}

export interface ProbeResult {
    duration: number;
    hasVideo: boolean;
    hasAudio: boolean;
    width?: number;
    height?: number;
    rotation?: number;
    fps?: number;
}

export interface JobStatus {
    state: "staging" | "probing" | "encoding" | "verifying" | "ready" | "error" | "canceled";
    progress?: number;
    message?: string;
    bytesTotal?: number;
}
