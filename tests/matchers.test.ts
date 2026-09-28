/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

// limits.ts and patches.ts import Vencord path aliases, so they cannot be loaded here.
// Read the regexes out of the source instead of copying them, so this file cannot drift
// from what actually ships.
const read = (file: string) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const literal = (source: string, pattern: RegExp, label: string) => {
    const found = source.match(pattern);
    assert.ok(found, `could not extract the ${label} regex; update this test alongside the source`);
    return new Function(`return ${found[1]}`)() as RegExp;
};

// Vencord expands \i before applying a matcher (canonicalizeMatch, src/utils/patches.ts).
// A plain RegExp test does not implement that extension, so mirror it here.
const IDENT = String.raw`(?:[A-Za-z_$][\w$]*)`;
const canonicalize = (re: RegExp) => new RegExp(
    re.source.replaceAll(/(\\*)\\i/g, (match, escapes) => escapes.length % 2 === 0 ? `${escapes}${IDENT}` : match.slice(1)),
    re.flags
);

test("the \\i expansion used by these tests is actually applied", () => {
    assert.equal(canonicalize(/a\i b/).source, `a${IDENT} b`);
    // An odd number of leading backslashes escapes the extension: \\i means a literal \i.
    assert.equal(canonicalize(/a\\i/).source, String.raw`a\i`);
});

// Captured from Discord Stable web build web.352b0482a8b3b388.js on 2026-09-23.
// Excerpts only; a stale fixture is evidence for that fixture alone, so re-capture
// from the live bundle when a matcher is suspected of breaking again.
const UPLOAD_FIXTURE = 'ion:"showUploadFileSizeExceededError"}))})})}async function y(e,t,n){let{filesMetadata:c,requireConfirm:E=!0,isThumbnail:A=!1,origin:f}=arguments.length>3&&void 0!==arguments[3]?arguments[3]:{};if(e.length<1)return;if(null!=c&&c.length!==e.length)throw Error("Unexpected mismatch between files and file metadata");let T=t.getGuildId()';

// Module 409481, the whole of it: n.d(t,{C:()=>i});function i(e){return Math.max(0x1400000,e)}
const LIMIT_HELPER = "function i(e){return Math.max(0x1400000,e)}";

// Stable web.d4c7976eccf337f1.js, captured 2026-09-28. The old module label is gone.
const USER_GUILD_LIMIT = "function S(e){let t=o.default.getCurrentUser(),n=c.Ay.getUserMaxFileSize(t);if(null==e)return n;let i=l.A.getGuild(e);return Math.max(null!=i?g.reduce((e,t)=>{let[n,r]=t;return i.features.has(n)&&r>e?r:e},_.TbF):_.TbF,n)}";

test("the user/guild limit lookup survives removal of the old module label", () => {
    const source = read("limits.ts");
    const moduleLookup = source.match(/mapMangledModuleLazy\((\[[^\]]+\]),/);
    const exportLookup = source.match(/getUserGuildLimit: filters.byCode\(([^\n]+)\)/);
    assert.ok(moduleLookup);
    assert.ok(exportLookup);
    const anchors = JSON.parse(moduleLookup[1]) as string[];
    const filters = JSON.parse(`[${exportLookup[1]}]`) as string[];
    assert.ok(!USER_GUILD_LIMIT.includes("getGuildMaxFileSize"));
    for (const anchor of [...anchors, ...filters]) assert.ok(USER_GUILD_LIMIT.includes(anchor));

    // Exercise the captured implementation for DMs, unboosted and boosted guilds.
    let userLimit = 10485760;
    let guild: { features: Set<string>; } | undefined;
    const limit = new Function("o", "c", "l", "g", "_", `return (${USER_GUILD_LIMIT})`)(
        { default: { getCurrentUser: () => ({}) } },
        { Ay: { getUserMaxFileSize: () => userLimit } },
        { A: { getGuild: () => guild } },
        [["boosted", 104857600]], { TbF: 10485760 }
    );
    assert.equal(limit(), userLimit);
    assert.equal(limit("guild"), userLimit);
    guild = { features: new Set(["boosted"]) };
    assert.equal(limit("guild"), 104857600);
    userLimit = 524288000;
    assert.equal(limit("guild"), userLimit);
});

test("the upload patch anchors and matches exactly once", () => {
    const patches = read("patches.ts");
    assert.ok(patches.includes("Unexpected mismatch between files and file metadata"), "find anchor changed");
    assert.ok(UPLOAD_FIXTURE.includes("Unexpected mismatch between files and file metadata"), "fixture lost the anchor");

    const match = literal(patches, /match:\s*(\/.*?\/[dgimsuvy]*),/s, "upload patch");
    const hits = [...UPLOAD_FIXTURE.matchAll(new RegExp(canonicalize(match).source, "g"))];

    assert.equal(hits.length, 1, "the upload patch must select exactly one site");
    assert.equal(hits[0][0], "async function y(e,t,n){");
    // The patch captures the function name so it can be aliased past the local shadow.
    assert.equal(hits[0][1], "y");
});

test("the upload limit finder matches the shipped helper and nothing near it", () => {
    const finder = canonicalize(literal(read("limits.ts"), /findByCodeLazy\(\s*(\/.*?\/[dgimsuvy]*)\s*\)/s, "upload limit"));

    assert.ok(finder.test(LIMIT_HELPER), "finder no longer matches Discord's upload floor helper");

    // Ordinary clamp helpers live in the same bundle and must not be selected instead.
    for (const other of [
        "function o(e){return Math.max(5*e.pageSize,250)}",
        "function f(e){return Math.max(0,e)}",
        "function p(e,t,n){return Math.max(0,e-(t-n))}",
        "function eL(e,t){return Math.max(eO,Math.min(eC,.5*e/t))}"
    ]) assert.ok(!finder.test(other), `finder wrongly matches ${other}`);

    // The floor value is Discord's to change; the lookup must survive that.
    assert.ok(finder.test("function i(e){return Math.max(0x3200000,e)}"));
    assert.ok(finder.test("function qq(n){return Math.max(52428800,n)}"));
});

test("the retired kestrel experiment is not referenced any more", () => {
    // Discord shipped 2026-08-kestrel-ga and deleted its config module; keying off any of
    // these strings is what broke resolveLimit. Comments are stripped first, because the
    // fix deliberately records the retired experiment's name in a comment.
    const code = read("limits.ts").replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const gone of ["2026-08-kestrel-ga", "web.filesExceedUploadLimits", "isGA:", ".enabled?Math.max("])
        assert.ok(!code.includes(gone), `limits.ts still depends on the removed ${gone}`);
});
