export interface CompressionOptions {
    targetBytes: number;
    audioRate: number;
    removeAudio: boolean;
    resolution?: "1080" | "720" | "480" | "360" | "240" | "144";
}

export function calculateBitrate(
    duration: number,
    targetBytes: number,
    removeAudio: boolean
): { videoBps: number; audioBps: number; isValid: boolean } {
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
