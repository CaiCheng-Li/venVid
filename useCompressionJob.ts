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
    finished: Promise<void>;
    timer?: ReturnType<typeof setTimeout>;
    wake?: () => void;
}

export function useCompressionJob(original: File) {
    const active = useRef<Run | null>(null);
    const mounted = useRef(true);
    const running = useRef(false);
    const cancelInProgress = useRef(false);
    const pendingCleanup = useRef(new Set<string>());
    const [busy, setBusy] = useState(false);
    const [canceling, setCanceling] = useState(false);
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
                run.wake?.();
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
        if (running.current || cancelInProgress.current) return;
        running.current = true;
        let finish!: () => void;
        const finished = new Promise<void>(resolve => { finish = resolve; });
        const run: Run = { id: `venvid-${crypto.randomUUID()}`, canceled: false, finished };
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
            let ready = await Native.getJobStatus(run.id);
            checkActive();
            // Older native helpers acknowledge the start immediately. A renderer reload can
            // leave one of those helpers running until Discord is fully restarted.
            while (ready.state !== "ready" && ready.state !== "error" && ready.state !== "canceled") {
                setStatus(ready);
                await new Promise<void>(resolve => {
                    run.wake = resolve;
                    run.timer = setTimeout(resolve, 300);
                });
                run.wake = undefined;
                checkActive();
                ready = await Native.getJobStatus(run.id);
                checkActive();
            }
            if (ready.state === "error") throw new Error(ready.message || "Video compression failed.");
            if (ready.state === "canceled") throw new Error("Video compression was canceled.");
            if (!Number.isSafeInteger(ready.bytesTotal) || ready.bytesTotal! <= 0) {
                throw new Error("Compression finished without a valid output file. Fully quit and reopen Discord, then retry.");
            }
            if (ready.bytesTotal! > options.targetBytes) {
                throw new Error("The compressed video exceeds the upload limit. Try a shorter selection or remove audio.");
            }
            const outputSize = ready.bytesTotal!;
            setStatus({ state: "verifying", message: "Preparing attachment and removing temporary files", progress: 100 });
            const chunks: Uint8Array<ArrayBuffer>[] = [];
            for (let offset = 0; offset < outputSize;) {
                checkActive();
                const length = Math.min(CHUNK_SIZE, outputSize - offset);
                const chunk = await Native.readOutputChunk(run.id, offset, length);
                checkActive();
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
            finish();
        }
    };

    const cancel = async (): Promise<boolean> => {
        if (cancelInProgress.current) return false;
        cancelInProgress.current = true;
        setCanceling(true);
        setBusy(true);
        reset();
        setStatus({ state: "canceled", message: "Removing temporary video files", progress: 0 });
        const run = active.current;
        if (run) {
            run.canceled = true;
            clearTimeout(run.timer);
            run.wake?.();
        }
        try {
            // Stop native work immediately, including FFmpeg holding a partial output open.
            // The run's finally block also cleans jobs whose prepare/read IPC was still pending.
            await Promise.allSettled([...pendingCleanup.current].map(id => Native.disposeJob(id)));
            await run?.finished;
            for (const id of pendingCleanup.current) {
                await Native.disposeJob(id);
                pendingCleanup.current.delete(id);
            }
            active.current = null;
            return true;
        } catch (err) {
            if (mounted.current) setError(`Could not remove temporary video files. Click Cancel to retry. ${String(err)}`);
            return false;
        } finally {
            cancelInProgress.current = false;
            if (mounted.current) {
                setCanceling(false);
                setBusy(false);
            }
        }
    };

    return { busy, canceling, status, output, error, reset, compress, cancel, setError };
}
