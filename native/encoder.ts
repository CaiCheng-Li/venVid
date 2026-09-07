/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import * as fs from "fs";

import type { EncodeOptions } from "../types";
import { getJob } from "./jobs";

function getFfmpegCommand(): string {
    return "ffmpeg";
}

export function startEncode(jobId: string, options: EncodeOptions): Promise<void> {
    const job = getJob(jobId);
    if (!job) return Promise.reject(new Error("Job not found"));

    job.state = "encoding";
    job.progress = 0;
    job.message = "Starting encode...";

    const { duration, targetBytes, trimStart, trimEnd, removeAudio, resolution } = options;
    const safetyFactor = 0.97;
    const audioBps = removeAudio ? 0 : 128000;

    const videoBps = Math.floor((targetBytes * 8 * safetyFactor) / duration) - audioBps;
    if (videoBps <= 0) {
        return Promise.reject(new Error("Target size is too small for this duration and audio setting."));
    }

    let filterComplex = "";
    if (resolution) {
        // e.g. "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,format=yuv420p"
        // But we need to ensure even dimensions:
        filterComplex = `scale='trunc(min(${resolution},iw)/2)*2':'trunc(min(${resolution}*ih/iw,ih)/2)*2':force_original_aspect_ratio=decrease`;
    }

    // Default filters
    const vf = filterComplex ? `${filterComplex},format=yuv420p` : "format=yuv420p";

    const commonArgs = [
        "-y",
        "-ss", trimStart.toString(),
        "-t", (trimEnd - trimStart).toString(),
        "-i", job.inputPath,
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
                        const p = (time / duration) * 50;
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
                    job.bytesTotal = stat.size;
                    job.state = "ready";
                    job.progress = 100;
                    job.message = "Ready";
                    resolve();
                }
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

