import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

// Run from the Vencord checkout to use its existing build tool, without a second dependency tree.
const require = createRequire(resolve("package.json"));
const { build } = require("esbuild");
const harness = globalThis.__venVidTest = {};
const result = await build({
    entryPoints: [fileURLToPath(new URL("../uploadAdapter.ts", import.meta.url))],
    bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{
        name: "test-discord-boundary",
        setup(builder) {
            builder.onResolve({ filter: /^@|^\.\/IntegrationModal$|^\.\/limits$/ }, args => ({ path: args.path, namespace: "test" }));
            builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: {
                "@utils/Logger": "export class Logger { error() {} warn() {} }",
                "@webpack/common": `
                    const h = globalThis.__venVidTest;
                    export const ChannelStore = { getChannel: id => h.channels[id] };
                    export const PermissionsBits = { ATTACH_FILES: 1n };
                    export const PermissionStore = { can: () => h.permission };
                    export const showToast = message => h.notices.push(message);
                `,
                "./limits": "export const resolveLimit = () => globalThis.__venVidTest.limit;",
                "./IntegrationModal": `
                    export function openProofModal(context) {
                        const h = globalThis.__venVidTest;
                        if (h.modalError) throw Error('modal failed');
                        h.contexts.push(context);
                        return () => { h.closed++; context.attempt.continue(); };
                    }
                `
            }[args.path] }));
        }
    }]
});
const adapter = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const channel = { id: "original", guild_id: "guild", getGuildId: () => "guild" };
const video = () => new File([new Uint8Array(101)], "视频 clip.mp4", { type: "video/mp4" });
const replacement = () => new File(["proof"], "proof.mp4", { type: "video/mp4" });
const tick = () => new Promise(resolve => queueMicrotask(resolve));

function simulateUpload(...args) {
    function original() {
        const intercepted = adapter.intercept(original, this, arguments);
        if (intercepted) return intercepted;
        harness.calls.push({ receiver: this, args: [...arguments] });
        return Promise.resolve();
    }
    return original.apply(harness.receiver, args);
}

beforeEach(() => {
    adapter.stopAdapter();
    Object.assign(harness, {
        limit: 100, permission: true, channels: { original: channel },
        contexts: [], calls: [], notices: [], closed: 0, modalError: false, receiver: {}
    });
    adapter.startAdapter();
});

test("decline resumes once with receiver, destination, draft and metadata intact", async () => {
    const file = video();
    const metadata = { spoiler: true, description: "description" };
    const options = { origin: "test", filesMetadata: [metadata], requireConfirm: true };
    const extra = { opaque: true };
    const result = simulateUpload([file], channel, 0, options, extra);
    assert.ok(result instanceof Promise);
    assert.equal(harness.calls.length, 0);
    await tick();
    assert.equal(harness.contexts.length, 1);
    const { attempt } = harness.contexts[0];
    attempt.continue();
    attempt.continue();
    await result;
    assert.equal(harness.calls.length, 1);
    const call = harness.calls[0];
    assert.equal(call.receiver, harness.receiver);
    assert.equal(call.args[0][0], file);
    assert.equal(call.args[1], channel);
    assert.equal(call.args[2], 0);
    assert.deepEqual(call.args[3], options);
    assert.equal(call.args[4], extra);
});

test("replacement preserves mixed file order and uses the captured destination", async () => {
    const image = new File(["ok"], "image.png", { type: "image/png" });
    const result = simulateUpload([image, video()], channel, 7);
    await tick();
    const context = harness.contexts[0];
    const file = replacement();
    context.attach(file);
    context.attempt.continue();
    await result;
    assert.equal(harness.calls.length, 1);
    assert.deepEqual(harness.calls[0].args[0], [image, file]);
    assert.equal(harness.calls[0].args[1].id, "original");
    assert.equal(harness.calls[0].args[2], 7);
    assert.equal(harness.contexts.length, 1);
});

test("overlapping attempts use independent bypasses and can resolve in reverse order", async () => {
    const first = simulateUpload([video()], channel, 0);
    const second = simulateUpload([video()], channel, 1);
    await tick();
    harness.contexts[1].attempt.continue();
    harness.contexts[0].attempt.continue();
    await Promise.all([first, second]);
    assert.deepEqual(harness.calls.map(call => call.args[2]), [1, 0]);
    assert.equal(harness.contexts.length, 2);
});

test("unknown limit, equality, instant-send, thumbnail and multi-video paths continue normally", async () => {
    harness.limit = undefined;
    await simulateUpload([video()], channel, 0);
    harness.limit = 101;
    await simulateUpload([video()], channel, 0);
    harness.limit = 100;
    await simulateUpload([video()], channel, 0, { requireConfirm: false });
    await simulateUpload([video()], channel, 0, { requireConfirm: null });
    await simulateUpload([video()], channel, 0, { isThumbnail: true });
    await simulateUpload([video(), video()], channel, 0);
    assert.equal(harness.calls.length, 6);
    assert.equal(harness.contexts.length, 0);
});

test("attach rechecks a lowered or unknown limit and keeps the attempt recoverable", async () => {
    const result = simulateUpload([video()], channel, 0);
    await tick();
    const context = harness.contexts[0];
    harness.limit = 1;
    assert.throws(() => context.attach(replacement()), /limit/);
    harness.limit = undefined;
    assert.throws(() => context.attach(replacement()), /recheck/);
    assert.equal(context.attempt.pending, true);
    assert.equal(harness.calls.length, 0);
    harness.limit = 100;
    context.attach(replacement());
    await result;
    assert.equal(harness.calls.length, 1);
});

test("lost destination and permission do not attach or consume the attempt", async () => {
    const result = simulateUpload([video()], channel, 0);
    await tick();
    const context = harness.contexts[0];
    delete harness.channels.original;
    assert.throws(() => context.attach(replacement()), /destination/);
    harness.channels.original = channel;
    harness.permission = false;
    assert.throws(() => context.attach(replacement()), /attachments/);
    assert.equal(harness.calls.length, 0);
    context.attempt.continue();
    await result;
});

test("shutdown before or after opening invalidates queued and late callbacks", async () => {
    const first = simulateUpload([video()], channel, 0);
    adapter.stopAdapter();
    await first;
    await tick();
    assert.equal(harness.contexts.length, 0);
    adapter.startAdapter();
    const second = simulateUpload([video()], channel, 0);
    await tick();
    const context = harness.contexts[0];
    adapter.stopAdapter();
    assert.throws(() => context.attach(replacement()), /no longer active/);
    context.attempt.continue();
    await second;
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.closed, 1);
});

test("modal failure releases the original operation instead of losing the file", async () => {
    harness.modalError = true;
    await simulateUpload([video()], channel, 0);
    assert.equal(harness.calls.length, 1);
});
