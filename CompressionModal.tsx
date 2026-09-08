/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import type { RenderModalProps } from "@vencord/discord-types";
import { closeModal, Modal, openModal, useEffect, useRef, useState } from "@webpack/common";

import { calculateBitrate, estimateOutputSize } from "./compression";
import { formatBytes } from "./limits";
import type { EncodeOptions } from "./types";
import type { ProofContext } from "./uploadAdapter";
import { useCompressionJob } from "./useCompressionJob";
import { TrimTimeline, VideoPreview } from "./VideoTimeline";

interface EditorProps extends RenderModalProps {
    context: ProofContext;
    fileIndex: number;
    currentBatchIndex: number;
    totalInBatch: number;
    onNext: (replacement?: File) => void;
    onPrev: () => void;
    onCancelAll: () => void;
}

function CompressionEditor({ context, fileIndex, currentBatchIndex, totalInBatch, onNext, onPrev, onCancelAll, ...props }: EditorProps) {
    const original = context.attempt.files[fileIndex];
    const [url, setUrl] = useState<string>();
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [removeAudio, setRemoveAudio] = useState(false);
    const [resolution, setResolution] = useState<EncodeOptions["resolution"]>();
    const videoRef = useRef<HTMLVideoElement>(null);
    const scrubbing = useRef(false);
    const resumePlayback = useRef(false);
    const { busy, status, output, error, reset, compress, setError } = useCompressionJob(original);

    useEffect(() => {
        const preview = URL.createObjectURL(original);
        setUrl(preview);
        return () => URL.revokeObjectURL(preview);
    }, [original]);

    const selectedDuration = trimEnd - trimStart;
    const bitrate = calculateBitrate(selectedDuration, context.limit, removeAudio);
    const estimatedSize = estimateOutputSize(selectedDuration, bitrate.videoBps, bitrate.audioBps);
    const isLast = currentBatchIndex === totalInBatch - 1;

    const seek = (time: number) => {
        // Update the line immediately; decoding and seeked events can arrive later.
        setCurrentTime(time);
        const video = videoRef.current;
        if (video && video.readyState >= 1) video.currentTime = time;
    };
    const attach = () => {
        if (!output) return;
        try { onNext(output); }
        catch (err) { setError(String(err)); }
    };

    return (
        <Modal
            {...props}
            title="Compress Video"
            subtitle={`Destination: ${context.channelId}`}
            size="md"
            notice={error ? { type: "critical", message: error } : undefined}
            actions={[
                { text: totalInBatch > 1 ? "Cancel Batch" : "Cancel", variant: "secondary", onClick: onCancelAll },
                {
                    text: output ? (isLast ? "Attach Video" : "Attach & Next") : busy ? "Compressing…" : "Compress",
                    variant: "primary",
                    disabled: busy || !bitrate.isValid,
                    onClick: output ? attach : () => compress({
                        targetBytes: context.limit, audioRate: 128000, trimStart, trimEnd, removeAudio, resolution
                    })
                }
            ]}
        >
            <div className="venvid-compression">
                <div className="venvid-size-summary" aria-live="polite">
                    <span className="venvid-muted">{output ? "Final size" : "Est size"}</span>
                    <strong>{output ? formatBytes(output.size) : bitrate.isValid ? formatBytes(estimatedSize) : "—"}</strong>
                </div>
                {url && (
                    <VideoPreview url={url} videoRef={videoRef} scrubbing={scrubbing} onTimeUpdate={setCurrentTime}
                        onDurationChange={value => { setDuration(value); setTrimEnd(value); }} />
                )}
                <TrimTimeline
                    duration={duration}
                    currentTime={currentTime}
                    trimStart={trimStart}
                    trimEnd={trimEnd}
                    disabled={busy}
                    onTrimStartChange={time => { reset(); setTrimStart(time); }}
                    onTrimEndChange={time => { reset(); setTrimEnd(time); }}
                    onSeek={seek}
                    onScrubStart={() => {
                        scrubbing.current = true;
                        resumePlayback.current = !!videoRef.current && !videoRef.current.paused;
                        videoRef.current?.pause();
                    }}
                    onScrubEnd={() => {
                        scrubbing.current = false;
                        if (resumePlayback.current) void videoRef.current?.play().catch(() => {});
                    }}
                />
                <div className="venvid-options">
                    <label>
                        <input type="checkbox" checked={removeAudio} disabled={busy}
                            onChange={e => { reset(); setRemoveAudio(e.target.checked); }} />
                        Remove audio
                    </label>
                    <label>Resolution
                        <select value={resolution || ""} disabled={busy} onChange={e => {
                            reset();
                            setResolution((e.target.value || undefined) as EncodeOptions["resolution"]);
                        }}>
                            <option value="">Original</option>
                            <option value="1080">1080p</option>
                            <option value="720">720p</option>
                            <option value="480">480p</option>
                            <option value="360">360p</option>
                        </select>
                    </label>
                </div>
                {totalInBatch > 1 && (
                    <div className="venvid-batch-nav">
                        <button className="venvid-nav-arrow" disabled={currentBatchIndex === 0 || busy}
                            onClick={onPrev} aria-label="Previous video">◀</button>
                        <span>{currentBatchIndex + 1} / {totalInBatch}</span>
                        <button className="venvid-nav-arrow" disabled={isLast || busy}
                            onClick={() => onNext()} aria-label="Next video">▶</button>
                    </div>
                )}
                {busy && (
                    <div className="venvid-progress" role="status">
                        <span>{status?.message} ({(status?.progress ?? 0).toFixed(1)}%)</span>
                        <progress value={status?.progress ?? 0} max={100} aria-label="Compression progress" />
                    </div>
                )}
            </div>
        </Modal>
    );
}

function BatchModalContent({ context, ...props }: RenderModalProps & { context: ProofContext; }) {
    const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
    const [replacements] = useState(() => new Map<number, File>());
    const handleNext = (replacement?: File) => {
        if (replacement) replacements.set(context.indices[currentBatchIndex], replacement);
        if (currentBatchIndex < context.indices.length - 1) {
            setCurrentBatchIndex(currentBatchIndex + 1);
        } else {
            context.attach(replacements);
            props.onClose();
        }
    };

    return (
        <CompressionEditor key={currentBatchIndex} {...props} context={context}
            fileIndex={context.indices[currentBatchIndex]} currentBatchIndex={currentBatchIndex}
            totalInBatch={context.indices.length} onNext={handleNext}
            onPrev={() => setCurrentBatchIndex(index => Math.max(0, index - 1))} onCancelAll={props.onClose} />
    );
}

export function openCompressionModal(context: ProofContext): () => void {
    const key = openModal(props => (
        <ErrorBoundary onError={() => {
            context.attempt.continue();
            props.onClose();
        }}>
            <BatchModalContent {...props} context={context} />
        </ErrorBoundary>
    ), {
        modalKey: `venvid-${context.attempt.id}`,
        onCloseCallback: () => { context.attempt.continue(); }
    });
    return () => closeModal(key);
}
