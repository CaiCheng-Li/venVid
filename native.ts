/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Buffer } from "node:buffer";

import { spawnSync } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import * as fs from "fs";

import { startEncode } from "./native/encoder";
import { cleanupAllJobs, createJob, deleteJob, getJob } from "./native/jobs";
import { probeMedia } from "./native/media";
import type { EncodeOptions, JobStatus, ProbeResult } from "./types";

export async function getToolsStatus(_event: IpcMainInvokeEvent): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
    let ffmpeg = false;
    let ffprobe = false;
    try {
        const ffmpegRes = spawnSync("ffmpeg", ["-version"], { windowsHide: true });
        if (ffmpegRes.status === 0) ffmpeg = true;
    } catch {}

    try {
        const ffprobeRes = spawnSync("ffprobe", ["-version"], { windowsHide: true });
        if (ffprobeRes.status === 0) ffprobe = true;
    } catch {}

    return { ffmpeg, ffprobe };
}

export async function prepareJob(_event: IpcMainInvokeEvent, jobId: string): Promise<void> {
    createJob(jobId);
}

export async function stageInputChunk(_event: IpcMainInvokeEvent, jobId: string, chunk: Uint8Array): Promise<void> {
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (job.state !== "staging") throw new Error("Job is not accepting input");
    // Write chunk sequentially
    fs.appendFileSync(job.inputPath, Buffer.from(chunk));
}

export async function probeJob(_event: IpcMainInvokeEvent, jobId: string): Promise<ProbeResult> {
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");
    job.state = "probing";
    job.message = "Probing media...";

    try {
        const result = await probeMedia(jobId);
        return result;
    } catch (err) {
        job.state = "error";
        job.message = (err as Error).message;
        throw err;
    }
}

export async function startJobEncode(_event: IpcMainInvokeEvent, jobId: string, options: EncodeOptions): Promise<void> {
    await startEncode(jobId, options);
}

export async function getJobStatus(_event: IpcMainInvokeEvent, jobId: string): Promise<JobStatus> {
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");
    return {
        state: job.state,
        progress: job.progress,
        message: job.message,
        bytesTotal: job.bytesTotal
    };
}

export async function cancelJob(_event: IpcMainInvokeEvent, jobId: string): Promise<void> {
    const job = getJob(jobId);
    if (!job) return;
    job.state = "canceled";
    job.message = "Canceled";
    await deleteJob(jobId);
}

export async function readOutputChunk(_event: IpcMainInvokeEvent, jobId: string, offset: number, length: number): Promise<Uint8Array> {
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (job.state !== "ready") throw new Error("Job is not ready");
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0 || length > 5 * 1024 * 1024) {
        throw new Error("Invalid output chunk range");
    }

    const fd = fs.openSync(job.outputPath, "r");
    try {
        const buffer = Buffer.alloc(length);
        const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
        return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
        fs.closeSync(fd);
    }
}

export async function disposeJob(_event: IpcMainInvokeEvent, jobId: string): Promise<void> {
    await deleteJob(jobId);
}

export async function cleanupAllJobsIpc(_event: IpcMainInvokeEvent): Promise<void> {
    await cleanupAllJobs();
}
