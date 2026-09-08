/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";

import { calculateBitrate } from "../compression";
import { disposeJob, prepareJob, probeJob, readOutputChunk, stageInputChunk, startJobEncode } from "../native";
import { cleanupAllJobs, createJob, deleteJob, getJob, getPluginTempDir } from "../native/jobs";

const event = undefined as never;
let fixtureDir: string;
let fixture: string;
let originalBytes: Buffer;
let originalHash: string;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

before(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "venvid-test-"));
    fixture = path.join(fixtureDir, "original.mp4");
    const generated = spawnSync("ffmpeg", [
        "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440", "-t", "4",
        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", fixture
    ], { windowsHide: true });
    assert.equal(generated.status, 0, generated.stderr?.toString());
    originalBytes = fs.readFileSync(fixture);
    originalHash = hash(originalBytes);
});

after(async () => {
    await cleanupAllJobs();
    if (fixtureDir && path.dirname(fixtureDir) === path.resolve(os.tmpdir()) && path.basename(fixtureDir).startsWith("venvid-test-")) {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
});

async function stage(id: string) {
    await prepareJob(event, id);
    await stageInputChunk(event, id, originalBytes);
    return getJob(id)!;
}

test("trimmed output stays usable in memory after all temporary copies are deleted", async () => {
    const job = await stage("test-complete");
    const probe = await probeJob(event, job.id);
    await startJobEncode(event, job.id, {
        duration: probe.duration, targetBytes: 250_000, audioRate: 128000,
        trimStart: 1, trimEnd: 3, removeAudio: false, resolution: "240"
    });
    assert.equal(job.state, "ready");
    assert.ok(job.bytesTotal! > 0 && job.bytesTotal! <= 250_000);
    const metadata = spawnSync("ffprobe", ["-v", "quiet", "-show_streams", "-show_format", "-of", "json", job.outputPath], { windowsHide: true });
    const output = JSON.parse(metadata.stdout.toString());
    assert.equal(output.streams.find(stream => stream.codec_type === "video").height, 240);
    assert.ok(Math.abs(Number(output.format.duration) - 2) < 0.2);
    assert.ok(output.streams.some(stream => stream.codec_type === "audio"));
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < job.bytesTotal!; offset += 8192) {
        chunks.push(new Uint8Array(await readOutputChunk(event, job.id, offset, Math.min(8192, job.bytesTotal! - offset))));
    }
    const attachment = new File(chunks, "clip-compressed.mp4", { type: "video/mp4" });
    const outputHash = hash(fs.readFileSync(job.outputPath));
    await Promise.all([disposeJob(event, job.id), disposeJob(event, job.id)]);
    assert.equal(fs.existsSync(job.dir), false);
    assert.equal(getJob(job.id), undefined);
    assert.equal(hash(new Uint8Array(await attachment.arrayBuffer())), outputHash);
    assert.equal(hash(fs.readFileSync(fixture)), originalHash);
    assert.deepEqual(fs.readdirSync(fixtureDir), ["original.mp4"]);
});

test("cancel during encoding closes FFmpeg before removing its files", async () => {
    const job = await stage("test-cancel-encode");
    const probe = await probeJob(event, job.id);
    const encode = startJobEncode(event, job.id, {
        duration: probe.duration, targetBytes: 250_000, audioRate: 128000,
        trimStart: 0, trimEnd: 4, removeAudio: true
    });
    const rejected = assert.rejects(encode);
    assert.ok(job.process);
    await disposeJob(event, job.id);
    await rejected;
    assert.equal(job.process, undefined);
    assert.equal(fs.existsSync(job.dir), false);
    assert.equal(hash(fs.readFileSync(fixture)), originalHash);
});

test("cancel during probing closes FFprobe and deletes its staged input", async () => {
    const job = await stage("test-cancel-probe");
    const rejected = assert.rejects(probeJob(event, job.id));
    assert.ok(job.process);
    await disposeJob(event, job.id);
    await rejected;
    assert.equal(job.process, undefined);
    assert.equal(fs.existsSync(job.dir), false);
});

test("cleanup failures remain retryable and job IDs cannot escape temporary storage", async () => {
    assert.throws(() => createJob("../outside"), /Invalid job ID/);
    const job = await stage("test-cleanup-retry");
    const remove = fs.promises.rm;
    fs.promises.rm = async () => { throw new Error("Simulated locked file"); };
    try {
        await assert.rejects(deleteJob(job.id), /Simulated locked file/);
        assert.equal(getJob(job.id), job);
        assert.equal(fs.existsSync(job.inputPath), true);
    } finally {
        fs.promises.rm = remove;
    }
    await deleteJob(job.id);
    assert.equal(fs.existsSync(job.dir), false);
    const root = getPluginTempDir();
    await cleanupAllJobs();
    assert.equal(fs.existsSync(root), false);
});

test("bitrate budgeting uses selected duration and rejects unknown duration", () => {
    assert.equal(calculateBitrate(0, 250_000, false).isValid, false);
    assert.equal(calculateBitrate(NaN, 250_000, false).isValid, false);
    const full = calculateBitrate(4, 250_000, false);
    const trimmed = calculateBitrate(2, 250_000, false);
    assert.ok(trimmed.videoBps > full.videoBps);
    assert.equal((trimmed.videoBps + trimmed.audioBps) * 2 / 8, 250_000 * 0.97);
});
