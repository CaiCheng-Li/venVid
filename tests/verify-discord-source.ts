import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";

import { uploadPatch } from "../patches";
import { createProofFile } from "../proofVideo";

async function main() {
    const checkout = process.cwd();
    const require = createRequire(resolve(checkout, "package.json"));
    const ts = require("typescript");
    const { canonicalizeMatch, canonicalizeReplace } = await import(pathToFileURL(resolve(checkout, "src/utils/patches.ts")).href);
    const modules: Record<string, string> = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const candidates = Object.entries(modules).filter(([, source]) => source.includes(uploadPatch.find));
    assert.equal(candidates.length, 1, "upload anchor must identify exactly one factory");
    const [id, source] = candidates[0];
    assert.equal(source.includes("venVidPending"), false, "injected binding must not collide");
    assert.equal(source.includes("venVidOriginalUpload"), false, "outer continuation binding must not collide");
    const match = canonicalizeMatch(uploadPatch.replacement.match);
    assert.equal([...source.matchAll(new RegExp(match.source, "g"))].length, 1);
    const patched = source.replace(match, canonicalizeReplace(uploadPatch.replacement.replace, "proof"));
    new Script(`({${patched}})`);

    function checkFinder(anchor: string, predicates: ((source: string) => boolean)[]) {
        const hits = Object.entries(modules).filter(([, source]) => source.includes(anchor));
        assert.equal(hits.length, 1, `${anchor}: unique module`);
        const [id, source] = hits[0];
        const ast = ts.createSourceFile("module.js", `({${source}})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const functions: string[] = [];
        function visit(node) {
            if (ts.isFunctionDeclaration(node)) functions.push(node.getText(ast));
            ts.forEachChild(node, visit);
        }
        visit(ast);
        for (const predicate of predicates) assert.equal(functions.filter(predicate).length, 1, `${anchor}: unique function`);
        return id;
    }
    const baseId = checkFinder("getGuildMaxFileSize", [source => source.includes(".getUserMaxFileSize(")]);
    const effectiveId = checkFinder("2026-08-kestrel-ga", [
        source => source.includes(".getConfig(") && source.includes("isGA:"),
        source => source.includes(".enabled?Math.max(")
    ]);

    // Execute only the captured upload factory with controlled Discord dependencies.
    const calls: unknown[] = [];
    const errors: unknown[] = [];
    const constants = { XgB: 10, rbe: { GUILD_VOICE: 2, GUILD_STAGE_VOICE: 13 }, HAw: {} };
    const stubs: Record<number, unknown> = {
        367513: { A: { updateChatOpen() {} } },
        148494: { A: { sendMessage() { assert.fail("proof must never send a message"); } } },
        608299: { A: { addFiles: args => calls.push(args) } },
        494921: { openUploadError: args => errors.push(args) },
        565150: { xz: { WEB: "web" } },
        658612: { z: async file => file },
        95561: { zV() {} },
        795129: { _: async () => 0 },
        346293: { s: args => args },
        550642: { R8: () => ({ enabled: false }), Jy: (_, limit) => limit, H6: () => "control" },
        522602: { A: { getUploadCount: () => 0 } },
        287809: { default: { getCurrentUser: () => ({}) } },
        174459: { default: { track() {} } },
        453771: { o2: () => 4096, Hb: String },
        158045: { YE: () => false },
        292348: { jS: () => 1000 },
        382287: { fJ: files => files.some(file => file.size > 4096), WQ: () => "oversized" },
        652215: constants,
        381941: { ty: {}, Hx: {} },
        202541: { PremiumTypes: { TIER_2: 2 } },
        375708: { intl: { string: String }, t: {} }
    };
    let decide: (files: File[]) => void;
    const bypass = new WeakSet();
    const proof = {
        intercept(original, receiver, args) {
            if (bypass.delete(args[0])) return;
            return new Promise<void>((resolve, reject) => {
                decide = files => {
                    bypass.add(files);
                    const resumed = [...args];
                    resumed[0] = files;
                    original.apply(receiver, resumed).then(resolve, reject);
                };
            });
        }
    };
    const factory = Function("proof", `return ({${patched}})[${JSON.stringify(id)}]`)(proof);
    const exports = {};
    const req = Object.assign((id: number) => stubs[id] ?? {}, {
        d(target, definitions) {
            for (const [name, get] of Object.entries(definitions)) Object.defineProperty(target, name, { get: get as () => unknown });
        }
    });
    factory({}, exports, req);
    const original = Object.values(Object.getOwnPropertyDescriptors(exports))
        .map(descriptor => descriptor.get?.()).find(fn => fn?.toString().includes(uploadPatch.find));
    assert.equal(typeof original, "function");
    const channel = { id: "captured", type: 0, getGuildId: () => "guild" };
    const file = new File([new Uint8Array(4097)], "big.mp4", { type: "video/mp4" });
    const pending = original([file], channel, 7, { filesMetadata: [{ spoiler: true, description: "kept" }] });
    assert.ok(pending instanceof Promise);
    assert.equal(calls.length, 0);
    assert.equal(errors.length, 0);
    const small = createProofFile("big.mp4");
    decide!([small]);
    await pending;
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        channelId: "captured", draftType: 7,
        files: [{ file: small, platform: "web", isThumbnail: false, origin: undefined,
            compressionMetadata: { originalContentType: "video/mp4", preCompressionSize: 1838 },
            spoiler: true, description: "kept" }]
    });
    const declined = original([file], channel, 0);
    decide!([file]);
    await declined;
    assert.equal(errors.length, 1, "decline reaches the real original oversized-file branch once");
    assert.equal(calls.length, 1, "decline does not attach oversized input");
    assert.equal(createProofFile("test.mov").size, 1838);
    console.log(JSON.stringify({ uploadModule: id, patchMatches: 1, baseLimitModule: baseId, effectiveLimitModule: effectiveId,
        preservedAsyncContract: true, replacementDraftCount: calls.length, declineErrorCount: errors.length,
        liveClientTest: false }, null, 2));
}

void main();
