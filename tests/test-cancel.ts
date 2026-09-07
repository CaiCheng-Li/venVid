import * as fs from "fs";
import * as path from "path";
import { prepareJob, stageInputChunk, probeJob, startJobEncode, getJobStatus, cancelJob } from "../native";

async function run() {
    const jobId = "test-job-cancel";
    await prepareJob(null as any, jobId);

    const inputPath = path.resolve(__dirname, "../../evidence/venvid-oversized.mp4");
    const inputBuffer = fs.readFileSync(inputPath);
    const chunkSize = 1024 * 1024;
    for (let i = 0; i < inputBuffer.length; i += chunkSize) {
        const chunk = inputBuffer.slice(i, i + chunkSize);
        await stageInputChunk(null as any, jobId, new Uint8Array(chunk));
    }

    const probe = await probeJob(null as any, jobId);
    
    await startJobEncode(null as any, jobId, {
        duration: probe.duration,
        targetBytes: 8 * 1024 * 1024,
        audioRate: 128000,
        trimStart: 0,
        trimEnd: Math.min(probe.duration, 10),
        removeAudio: false,
        resolution: "480"
    });

    return new Promise<void>((resolve, reject) => {
        let cycles = 0;
        const interval = setInterval(async () => {
            cycles++;
            try {
                const status = await getJobStatus(null as any, jobId);
                console.log(`Status: ${status.state}, Progress: ${status.progress.toFixed(2)}%`);
                
                if (cycles === 1) {
                    console.log("Canceling job!");
                    await cancelJob(null as any, jobId);
                }

                if (status.state === "canceled") {
                    clearInterval(interval);
                    console.log("Job canceled successfully!");
                    resolve();
                } else if (status.state === "error" || status.state === "ready") {
                    clearInterval(interval);
                    reject(new Error("Job finished instead of canceling!"));
                }
            } catch (e) {
                if (cycles > 2) {
                    // if getJobStatus fails after cancel, it's expected as the job is deleted
                    console.log("Job not found, which is expected after cancel.");
                    clearInterval(interval);
                    resolve();
                } else {
                    clearInterval(interval);
                    reject(e);
                }
            }
        }, 500);
    });
}

run().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
