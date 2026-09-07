/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface Job {
    id: string;
    dir: string;
    inputPath: string;
    outputPath: string;
    passlogPath: string;
    state: "staging" | "probing" | "encoding" | "verifying" | "ready" | "error" | "canceled";
    progress: number;
    message: string;
    bytesTotal?: number;
    process?: import("child_process").ChildProcess;
}

const activeJobs = new Map<string, Job>();
let pluginTempDir: string | null = null;

export function getPluginTempDir() {
    if (!pluginTempDir) {
        pluginTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "venVid-"));
    }
    return pluginTempDir;
}

export function createJob(id: string): Job {
    if (activeJobs.has(id)) {
        throw new Error("Job already exists");
    }
    const dir = path.join(getPluginTempDir(), id);
    fs.mkdirSync(dir, { recursive: true });

    const job: Job = {
        id,
        dir,
        inputPath: path.join(dir, "input"),
        outputPath: path.join(dir, "output.mp4"),
        passlogPath: path.join(dir, "passlog"),
        state: "staging",
        progress: 0,
        message: "Staging input..."
    };
    activeJobs.set(id, job);
    return job;
}

export function getJob(id: string): Job | undefined {
    return activeJobs.get(id);
}

export function deleteJob(id: string) {
    const job = activeJobs.get(id);
    if (!job) return;

    if (job.process) {
        try {
            job.process.kill("SIGKILL");
        } catch (e) {}
    }

    activeJobs.delete(id);

    try {
        fs.rmSync(job.dir, { recursive: true, force: true });
    } catch (e) {
        console.error("Failed to clean up job directory", e);
    }
}

export function cleanupAllJobs() {
    for (const id of activeJobs.keys()) {
        deleteJob(id);
    }
    if (pluginTempDir) {
        try {
            fs.rmSync(pluginTempDir, { recursive: true, force: true });
        } catch (e) {}
        pluginTempDir = null;
    }
}

