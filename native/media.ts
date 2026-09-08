/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";

import type { ProbeResult } from "../types";
import { getJob } from "./jobs";

function getFfprobeCommand(): string {
    // For now, assume it's in PATH. Can be made configurable later.
    return "ffprobe";
}

export function probeMedia(jobId: string): Promise<ProbeResult> {
    const job = getJob(jobId);
    if (!job) return Promise.reject(new Error("Job not found"));

    return new Promise((resolve, reject) => {
        const ffprobe = spawn(getFfprobeCommand(), [
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            job.inputPath
        ], {
            shell: false,
            windowsHide: true
        });
        job.process = ffprobe;

        let output = "";
        ffprobe.stdout.on("data", chunk => output += chunk);

        ffprobe.on("error", err => {
            reject(new Error("ffprobe failed to start: " + err.message));
        });

        ffprobe.on("close", code => {
            job.process = undefined;
            if (job.state === "canceled") return reject(new Error("Canceled"));
            if (code !== 0) {
                return reject(new Error(`ffprobe exited with code ${code}`));
            }
            try {
                const data = JSON.parse(output);
                let duration = parseFloat(data.format?.duration);
                let hasVideo = false;
                let hasAudio = false;
                let width, height, rotation, fps;

                for (const stream of data.streams || []) {
                    if (stream.codec_type === "video") {
                        // ignore attached pictures (cover art)
                        if (stream.disposition?.attached_pic === 1) continue;
                        hasVideo = true;
                        width = stream.width;
                        height = stream.height;

                        // Parse rotation from tags
                        if (stream.tags?.rotate) {
                            rotation = parseInt(stream.tags.rotate, 10);
                        }

                        // Parse fps
                        if (stream.r_frame_rate) {
                            const parts = stream.r_frame_rate.split("/");
                            if (parts.length === 2 && parts[1] !== "0") {
                                fps = parseFloat(parts[0]) / parseFloat(parts[1]);
                            }
                        }

                        if (!duration && stream.duration) {
                            duration = parseFloat(stream.duration);
                        }
                    } else if (stream.codec_type === "audio") {
                        hasAudio = true;
                        if (!duration && stream.duration) {
                            duration = parseFloat(stream.duration);
                        }
                    }
                }

                if (!hasVideo) {
                    return reject(new Error("No valid video stream found"));
                }
                if (isNaN(duration) || duration <= 0) {
                    return reject(new Error("Could not determine valid duration"));
                }

                resolve({
                    duration,
                    hasVideo,
                    hasAudio,
                    width,
                    height,
                    rotation,
                    fps
                });
            } catch (e) {
                reject(new Error("Failed to parse ffprobe output: " + e));
            }
        });
    });
}

