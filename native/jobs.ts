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
    cleanup?: Promise<void>;
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
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error("Invalid job ID");
    if (activeJobs.has(id)) {
        throw new Error("Job already exists");
    }
    const dir = fs.mkdtempSync(path.join(getPluginTempDir(), "job-"));

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

export async function deleteJob(id: string): Promise<void> {
    const job = activeJobs.get(id);
    if (!job) return;
    if (job.cleanup) return job.cleanup;
    job.state = "canceled";
    job.cleanup = (async () => {
        const child = job.process;
        if (child) {
            // Wait for stdio and file handles to close before removing files on Windows.
            await new Promise<void>((resolve, reject) => {
                const closed = () => resolve();
                child.once("close", closed);
                if (child.exitCode === null && child.signalCode === null && !child.kill("SIGKILL")) {
                    child.removeListener("close", closed);
                    reject(new Error("Could not stop the video process. Try cleanup again."));
                }
            });
        }
        const root = pluginTempDir && path.resolve(pluginTempDir);
        if (!root || path.dirname(path.resolve(job.dir)).toLowerCase() !== root.toLowerCase()) {
            throw new Error("Job directory is outside the temporary workspace");
        }
        await fs.promises.rm(job.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        activeJobs.delete(id);
    })();
    try {
        await job.cleanup;
    } finally {
        // Keep failed cleanups registered so a later dispose/disable can retry.
        job.cleanup = undefined;
    }
}

export async function cleanupAllJobs() {
    const results = await Promise.allSettled([...activeJobs.keys()].map(deleteJob));
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    if (pluginTempDir && !activeJobs.size) {
        // Job directories are already gone; remove only the empty parent.
        fs.rmdirSync(pluginTempDir);
        pluginTempDir = null;
    }
}

