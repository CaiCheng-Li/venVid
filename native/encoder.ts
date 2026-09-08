/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import * as fs from "fs";

import { calculateBitrate } from "../compression";
import type { EncodeOptions } from "../types";
import { getJob } from "./jobs";

function getFfmpegCommand(): string {
    return "ffmpeg";
}

export function startEncode(jobId: string, options: EncodeOptions): Promise<void> {
    const job = getJob(jobId);
    if (!job) return Promise.reject(new Error("Job not found"));
    if (job.state !== "probing") return Promise.reject(new Error("Job is not ready to encode"));

    job.state = "encoding";
    job.progress = 0;
    job.message = "Starting encode...";

    const { duration, targetBytes, trimStart, trimEnd, removeAudio, resolution } = options;
    const selectedDuration = trimEnd - trimStart;
    const { videoBps, audioBps, isValid } = calculateBitrate(selectedDuration, targetBytes, removeAudio);
    if (!Number.isFinite(duration) || !Number.isFinite(trimStart) || !Number.isFinite(trimEnd)
        || trimStart < 0 || trimEnd > duration + 0.1 || selectedDuration <= 0) {
        return Promise.reject(new Error("Invalid trim range"));
    }
    if (!isValid) {
        return Promise.reject(new Error("Target size is too small for this duration and audio setting."));
    }

    let filterComplex = "";
    if (resolution) {
        if (!["1080", "720", "480", "360", "240", "144"].includes(resolution)) {
            return Promise.reject(new Error("Invalid resolution"));
        }
        filterComplex = `scale=-2:'trunc(min(${resolution},ih)/2)*2'`;
    }

    // Default filters
    const vf = `${filterComplex || "scale=trunc(iw/2)*2:trunc(ih/2)*2"},format=yuv420p`;

    const commonArgs = [
        "-y",
        "-ss", trimStart.toString(),
        "-t", (trimEnd - trimStart).toString(),
        "-i", job.inputPath,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "libx264",
        "-vf", vf,
        "-b:v", `${videoBps}`,
        "-passlogfile", job.passlogPath
    ];

    const pass1Args = [
        ...commonArgs,
        "-an",
        "-pass", "1",
        "-f", "mp4",
        process.platform === "win32" ? "NUL" : "/dev/null"
    ];

    const pass2Args = [
        ...commonArgs,
        "-pass", "2",
        ...(removeAudio ? ["-an"] : ["-c:a", "aac", "-b:a", `${audioBps}`]),
        "-movflags", "+faststart",
        job.outputPath
    ];

    return new Promise((resolve, reject) => {
        const runPass = (args: string[], passNum: number): Promise<void> => {
            return new Promise((res, rej) => {
                if (job.state === "canceled") {
                    return rej(new Error("Canceled"));
                }
                job.message = `Encoding pass ${passNum}...`;
                job.progress = passNum === 1 ? 0 : 50;

                const proc = spawn(getFfmpegCommand(), args, { shell: false, windowsHide: true });
                job.process = proc;

                proc.stderr.on("data", chunk => {
                    const output = chunk.toString();
                    const match = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                    if (match) {
                        const h = parseFloat(match[1]);
                        const m = parseFloat(match[2]);
                        const s = parseFloat(match[3]);
                        const time = h * 3600 + m * 60 + s;
                        const p = Math.min(50, (time / selectedDuration) * 50);
                        job.progress = (passNum === 1 ? 0 : 50) + p;
                    }
                });

                proc.on("error", err => rej(new Error(`FFmpeg error on pass ${passNum}: ${err.message}`)));
                proc.on("close", code => {
                    job.process = undefined;
                    if (code !== 0) rej(new Error(`FFmpeg exited with code ${code} on pass ${passNum}`));
                    else res();
                });
            });
        };

        runPass(pass1Args, 1)
            .then(() => runPass(pass2Args, 2))
            .then(() => {
                if (job.state !== "canceled") {
                    job.state = "verifying";
                    job.message = "Verifying output...";
                    const stat = fs.statSync(job.outputPath);
                    if (stat.size <= 0 || stat.size > targetBytes) {
                        throw new Error("Encoded video exceeds the upload limit. Try a shorter selection or remove audio.");
                    }
                    job.bytesTotal = stat.size;
                    job.state = "ready";
                    job.progress = 100;
                    job.message = "Ready";
                    resolve();
                } else reject(new Error("Canceled"));
            })
            .catch(err => {
                if (job.state !== "canceled") {
                    job.state = "error";
                    job.message = err.message;
                }
                reject(err);
            });
    });
}
