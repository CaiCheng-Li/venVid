/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import type { PluginNative } from "@utils/types";
import { useEffect, useRef, useState } from "@webpack/common";

import type { EncodeOptions, JobStatus } from "./types";

const Native = VencordNative.pluginHelpers.VenVid as PluginNative<typeof import("./native")>;
const logger = new Logger("VenVid");
const CHUNK_SIZE = 5 * 1024 * 1024;

interface Run {
    id: string;
    canceled: boolean;
    timer?: ReturnType<typeof setTimeout>;
}

export function useCompressionJob(original: File) {
    const active = useRef<Run | null>(null);
    const mounted = useRef(true);
    const running = useRef(false);
    const pendingCleanup = useRef(new Set<string>());
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<JobStatus>();
    const [output, setOutput] = useState<File>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            const run = active.current;
            if (run) {
                run.canceled = true;
                clearTimeout(run.timer);
            }
            for (const id of pendingCleanup.current) {
                void Native.disposeJob(id).catch(err => logger.error("Temporary video cleanup failed", err));
            }
        };
    }, []);

    const reset = () => {
        setOutput(undefined);
        setStatus(undefined);
        setError(undefined);
    };

    const compress = async (options: Omit<EncodeOptions, "duration">) => {
        if (running.current) return;
        running.current = true;
        const run: Run = { id: `venvid-${crypto.randomUUID()}`, canceled: false };
        active.current = run;
        const isActive = () => mounted.current && !run.canceled && active.current === run;
        const checkActive = () => {
            if (!isActive()) throw new Error("Canceled");
        };
        reset();
        setBusy(true);
        let result: File | undefined;
        let failure: unknown;
        let polling = true;
        try {
            for (const id of pendingCleanup.current) {
                await Native.disposeJob(id);
                pendingCleanup.current.delete(id);
            }
            checkActive();
            setStatus({ state: "staging", message: "Preparing video", progress: 0 });
            pendingCleanup.current.add(run.id);
            await Native.prepareJob(run.id);
            for (let offset = 0; offset < original.size; offset += CHUNK_SIZE) {
                checkActive();
                const buffer = await original.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
                checkActive();
                await Native.stageInputChunk(run.id, new Uint8Array(buffer));
            }
            checkActive();
            setStatus({ state: "probing", message: "Reading video details", progress: 0 });
            const probe = await Native.probeJob(run.id);
            checkActive();
            if (!probe.hasVideo) throw new Error("No video stream found.");

            const poll = async () => {
                try {
                    const next = await Native.getJobStatus(run.id);
                    if (isActive() && polling) setStatus(next);
                } catch (err) {
                    if (isActive()) logger.warn("Could not read compression progress", err);
                }
                if (isActive() && polling) run.timer = setTimeout(poll, 300);
            };
            setStatus({ state: "encoding", message: "Starting compression", progress: 0 });
            run.timer = setTimeout(poll, 300);
            await Native.startJobEncode(run.id, { ...options, duration: probe.duration, removeAudio: options.removeAudio || !probe.hasAudio });
            checkActive();
            polling = false;
            clearTimeout(run.timer);
            const ready = await Native.getJobStatus(run.id);
            checkActive();
            if (ready.state !== "ready" || !ready.bytesTotal || ready.bytesTotal > options.targetBytes) {
                throw new Error("The compressed video is not ready or exceeds the upload limit.");
            }
            setStatus({ state: "verifying", message: "Preparing attachment and removing temporary files", progress: 100 });
            const chunks: Uint8Array<ArrayBuffer>[] = [];
            for (let offset = 0; offset < ready.bytesTotal;) {
                checkActive();
                const length = Math.min(CHUNK_SIZE, ready.bytesTotal - offset);
                const chunk = await Native.readOutputChunk(run.id, offset, length);
                if (chunk.byteLength !== length) throw new Error("Could not read the complete compressed video.");
                chunks.push(new Uint8Array(chunk));
                offset += chunk.byteLength;
            }
            const baseName = original.name.replace(/\.[^.]+$/, "");
            result = new File(chunks, `${baseName}-compressed.mp4`, { type: "video/mp4" });
        } catch (err) {
            failure = err;
        } finally {
            polling = false;
            clearTimeout(run.timer);
            try {
                // The attachment owns its bytes in memory before either temporary copy is removed.
                await Native.disposeJob(run.id);
                pendingCleanup.current.delete(run.id);
            } catch (err) {
                result = undefined;
                failure = new Error(`Could not remove temporary video files. Please retry. ${String(err)}`);
            }
            if (isActive()) {
                if (failure) setError(String(failure));
                else {
                    setOutput(result);
                    setStatus({ state: "ready", bytesTotal: result?.size, progress: 100 });
                    active.current = null;
                }
                setBusy(false);
            }
            running.current = false;
        }
    };

    return { busy, status, output, error, reset, compress, setError };
}
