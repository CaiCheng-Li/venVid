import assert from "node:assert/strict";
import { test } from "node:test";

import { isOversizedVideo, isValidLimit, UploadAttempt } from "../attempt";
import { createProofFile } from "../proofVideo";

test("per-file threshold accepts equality and rejects only greater sizes", () => {
    for (const [size, expected] of [[99, false], [100, false], [101, true]] as const)
        assert.equal(isOversizedVideo({ name: "clip.mp4", type: "video/mp4", size }, 100), expected);
    for (const bad of [undefined, NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
        assert.equal(isValidLimit(bad), false);
});

test("video detection handles absent MIME and Unicode filenames without treating known images as video", () => {
    assert.equal(isOversizedVideo({ name: "视频 clip.MKV", type: "", size: 101 }, 100), true);
    assert.equal(isOversizedVideo({ name: "clip.mov", type: "application/octet-stream", size: 101 }, 100), true);
    assert.equal(isOversizedVideo({ name: "fake.mp4", type: "image/png", size: 101 }, 100), false);
    assert.equal(isOversizedVideo({ name: "image.png", type: "image/png", size: 101 }, 100), false);
});

test("attach, close and repeated decline compete for one continuation", async () => {
    const original = new File(["source"], "clip.mp4");
    const replacement = createProofFile(original.name);
    const calls: File[][] = [];
    let finish!: () => void;
    const attempt = new UploadAttempt(files => {
        calls.push(files);
        return new Promise(resolve => { finish = resolve; });
    }, [original]);
    assert.equal(attempt.continue([replacement]), true);
    assert.equal(attempt.continue(), false);
    attempt.invalidate();
    assert.equal(attempt.continue(), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], replacement);
    finish();
    await attempt.completion;
});

test("shutdown invalidates late completion without resuming a draft", async () => {
    let calls = 0;
    const attempt = new UploadAttempt(async () => { calls++; }, []);
    attempt.invalidate();
    assert.equal(attempt.continue(), false);
    await attempt.completion;
    assert.equal(calls, 0);
});

test("original continuation failures propagate once", async () => {
    let calls = 0;
    const error = new Error("upload failed");
    const attempt = new UploadAttempt(async () => { calls++; throw error; }, []);
    const result = assert.rejects(attempt.completion, error);
    attempt.continue();
    attempt.continue();
    await result;
    assert.equal(calls, 1);
});

test("synchronous continuation errors settle the promise and prohibit replay", async () => {
    const attempt = new UploadAttempt(() => { throw new Error("sync failure"); }, []);
    const result = assert.rejects(attempt.completion, /sync failure/);
    assert.equal(attempt.continue(), true);
    assert.equal(attempt.continue(), false);
    await result;
});

test("generated proof is a small MP4 with a recognizable test filename", async () => {
    const proof = createProofFile("SPOILER_视频 clip.mov");
    assert.equal(proof.name, "SPOILER_视频 clip-venvid-test.mp4");
    assert.equal(proof.type, "video/mp4");
    assert.equal(proof.size, 1838);
    const bytes = new Uint8Array(await proof.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(4, 8)), "ftyp");
});
