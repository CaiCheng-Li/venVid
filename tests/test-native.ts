import * as fs from "fs";
import * as path from "path";
import { prepareJob, stageInputChunk, probeJob, startJobEncode, getJobStatus, disposeJob, getToolsStatus } from "../native";

async function run() {
    const tools = await getToolsStatus(null as any);
    console.log("Tools:", tools);
    if (!tools.ffmpeg || !tools.ffprobe) {
        console.error("FFmpeg or FFprobe not found.");
        process.exit(1);
    }

    const jobId = "test-job-1";
    console.log("Preparing job...");
    await prepareJob(null as any, jobId);

    console.log("Staging input...");
    const inputPath = path.resolve(__dirname, "../../evidence/venvid-oversized.mp4");
    const inputBuffer = fs.readFileSync(inputPath);
    const chunkSize = 1024 * 1024; // 1MB chunks
    for (let i = 0; i < inputBuffer.length; i += chunkSize) {
        const chunk = inputBuffer.slice(i, i + chunkSize);
        await stageInputChunk(null as any, jobId, new Uint8Array(chunk));
    }

    console.log("Probing job...");
    const probe = await probeJob(null as any, jobId);
    console.log("Probe result:", probe);

    console.log("Starting encode...");
    await startJobEncode(null as any, jobId, {
        duration: probe.duration,
        targetBytes: 8 * 1024 * 1024, // 8MB target
        audioRate: 128000,
        trimStart: 0,
        trimEnd: Math.min(probe.duration, 10), // Trim to 10 seconds for faster test
        removeAudio: false,
        resolution: "480"
    });

    return new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const status = await getJobStatus(null as any, jobId);
                console.log(`Status: ${status.state}, Progress: ${status.progress.toFixed(2)}%, Message: ${status.message}`);
                
                if (status.state === "ready") {
                    clearInterval(interval);
                    console.log("Finished! Total bytes:", status.bytesTotal);
                    await disposeJob(null as any, jobId);
                    resolve();
                } else if (status.state === "error" || status.state === "canceled") {
                    clearInterval(interval);
                    console.error("Failed:", status.message);
                    await disposeJob(null as any, jobId);
                    reject(new Error(status.message));
                }
            } catch (e) {
                clearInterval(interval);
                reject(e);
            }
        }, 500);
    });
}

run().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
