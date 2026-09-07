import "./styles.css";


import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import type { RenderModalProps } from "@vencord/discord-types";
import { closeModal, Modal, openModal, useEffect, useState, useRef, React } from "@webpack/common";

import { formatBytes } from "./limits";
import type { ProofContext } from "./uploadAdapter";
import { estimateOutputSize } from "./compression";

interface VideoPreviewProps {
    url: string;
    onTimeUpdate: (_time: number) => void;
    onDurationChange?: (_duration: number) => void;
    seekTime?: number;
}

function VideoPreview({ url, onTimeUpdate, onDurationChange, seekTime }: VideoPreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (seekTime !== undefined && videoRef.current) {
            if (Math.abs(videoRef.current.currentTime - seekTime) > 0.1) {
                videoRef.current.currentTime = seekTime;
            }
        }
    }, [seekTime]);

    return (
        <div className="venvid-preview-container" style={{ background: "#000", borderRadius: "8px", overflow: "hidden", display: "flex", justifyContent: "center" }}>
            <video
                ref={videoRef}
                src={url}
                controls
                preload="auto"
                style={{ maxWidth: "100%", maxHeight: "300px" }}
                onTimeUpdate={e => onTimeUpdate(e.currentTarget.currentTime)}
                onLoadedMetadata={e => onDurationChange?.(e.currentTarget.duration)}
            />
        </div>
    );
}

interface TrimTimelineProps {
    duration: number;
    currentTime: number;
    trimStart: number;
    trimEnd: number;
    onTrimStartChange: (_val: number) => void;
    onTrimEndChange: (_val: number) => void;
    onSeek: (_time: number) => void;
}

function TrimTimeline({ duration, currentTime, trimStart, trimEnd, onTrimStartChange, onTrimEndChange, onSeek }: TrimTimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<"start" | "end" | null>(null);

    const positionToTime = (clientX: number) => {
        const track = trackRef.current;
        if (!track || duration <= 0) return 0;
        const rect = track.getBoundingClientRect();
        return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
    };

    useEffect(() => {
        if (!dragging) return;
        const onMouseMove = (e: MouseEvent) => {
            const time = positionToTime(e.clientX);
            if (dragging === "start") {
                onTrimStartChange(Math.max(0, Math.min(trimEnd - 0.1, time)));
            } else {
                onTrimEndChange(Math.max(trimStart + 0.1, Math.min(duration, time)));
            }
        };
        const onMouseUp = () => setDragging(null);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, [dragging, trimStart, trimEnd, duration]);

    const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
    const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;
    const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    const handleTrackClick = (e: React.MouseEvent) => {
        if (dragging) return;
        onSeek(positionToTime(e.clientX));
    };

    return (
        <div className="venvid-timeline-container" style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "16px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{currentTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
                <span>Selected: {(trimEnd - trimStart).toFixed(2)}s</span>
            </div>

            <div className="venvid-trim-track" ref={trackRef} onClick={handleTrackClick}>
                <div className="venvid-trim-region" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
                <div className="venvid-trim-playhead" style={{ left: `${playheadPct}%` }} />
                <div
                    className="venvid-trim-handle"
                    style={{ left: `${startPct}%` }}
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDragging("start"); }}
                />
                <div
                    className="venvid-trim-handle"
                    style={{ left: `${endPct}%` }}
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDragging("end"); }}
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ whiteSpace: "nowrap" }}>Start:
                    <input
                        type="number"
                        min={0}
                        max={trimEnd}
                        step={0.1}
                        value={trimStart.toFixed(2)}
                        onChange={e => onTrimStartChange(Math.max(0, Math.min(trimEnd, parseFloat(e.target.value) || 0)))}
                        style={{ width: "60px", marginLeft: "4px" }}
                    />
                </label>
                <label style={{ whiteSpace: "nowrap" }}>End:
                    <input
                        type="number"
                        min={trimStart}
                        max={duration}
                        step={0.1}
                        value={trimEnd.toFixed(2)}
                        onChange={e => onTrimEndChange(Math.max(trimStart, Math.min(duration, parseFloat(e.target.value) || duration)))}
                        style={{ width: "60px", marginLeft: "4px" }}
                    />
                </label>
            </div>
        </div>
    );
}

// eslint-disable-next-line no-undef
const Native = VencordNative.pluginHelpers.VenVid as any;

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
    const [duration, setDuration] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [seekTime, setSeekTime] = useState<number>();
    
    const [trimStart, setTrimStart] = useState<number>(0);
    const [trimEnd, setTrimEnd] = useState<number>(0);
    
    const [removeAudio, setRemoveAudio] = useState(false);
    const [resolution, setResolution] = useState<"1080" | "720" | "480" | "360" | "240" | "144" | undefined>();
    
    const [jobId] = useState(`venvid-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    const [jobState, setJobState] = useState<string>("init");
    const [progress, setProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState("");
    const [error, setError] = useState<string>();
    const [outputSize, setOutputSize] = useState<number>();

    const pollInterval = useRef<NodeJS.Timeout | undefined>(undefined);

    useEffect(() => {
        const preview = URL.createObjectURL(original);
        setUrl(preview);
        return () => {
            URL.revokeObjectURL(preview);
            Native.disposeJob(jobId).catch(() => {});
        };
    }, [original, jobId]);

    useEffect(() => {
        if (duration > 0 && trimEnd === 0) {
            setTrimEnd(duration);
        }
    }, [duration, trimEnd]);

    const estimatedSize = estimateOutputSize(
        trimEnd - trimStart, 
        Math.floor((context.limit * 8 * 0.97) / (trimEnd - trimStart)) - (removeAudio ? 0 : 128000), 
        removeAudio ? 0 : 128000
    );

    async function startEncode() {
        try {
            setError(undefined);
            setJobState("staging");
            await Native.prepareJob(jobId);

            const chunkSize = 1024 * 1024 * 5; 
            for (let i = 0; i < original.size; i += chunkSize) {
                const chunk = original.slice(i, i + chunkSize);
                const buffer = await chunk.arrayBuffer();
                await Native.stageInputChunk(jobId, new Uint8Array(buffer));
            }

            setJobState("probing");
            const probe = await Native.probeJob(jobId);
            
            if (!probe.hasVideo) {
                throw new Error("No video stream found.");
            }

            setJobState("encoding");
            void Native.startJobEncode(jobId, {
                duration: probe.duration,
                targetBytes: context.limit,
                audioRate: 128000,
                trimStart,
                trimEnd,
                removeAudio,
                resolution
            });

            pollInterval.current = setInterval(async () => {
                try {
                    const status = await Native.getJobStatus(jobId);
                    setJobState(status.state);
                    setProgress(status.progress || 0);
                    setStatusMsg(status.message || "");

                    if (status.state === "ready" || status.state === "error" || status.state === "canceled") {
                        clearInterval(pollInterval.current);
                        if (status.state === "ready" && status.bytesTotal) {
                            setOutputSize(status.bytesTotal);
                        } else if (status.state === "error") {
                            setError(status.message);
                        }
                    }
                } catch (err) {
                    clearInterval(pollInterval.current);
                    setError(String(err));
                }
            }, 300);

        } catch (err) {
            setError(String(err));
            setJobState("error");
        }
    }

    const attach = async () => {
        if (jobState !== "ready" || !outputSize) return;
        
        try {
            const chunks: Uint8Array[] = [];
            let offset = 0;
            const chunkSize = 1024 * 1024 * 5; 
            while (offset < outputSize) {
                const len = Math.min(chunkSize, outputSize - offset);
                const chunk = await Native.readOutputChunk(jobId, offset, len);
                chunks.push(chunk);
                offset += len;
            }

            const ext = original.name.includes(".") ? original.name.split(".").pop() : "mp4";
            const baseName = original.name.replace(`.${ext}`, "");
            const finalFile = new File(chunks.map(c => c.buffer) as BlobPart[], `${baseName}-compressed.mp4`, { type: "video/mp4" });
            
            // Delete temp files now that the compressed output is in memory.
            // The original user file is untouched — only the staged copy and
            // encoded output inside the job's temp directory are removed.
            await Native.disposeJob(jobId).catch(() => {});

            onNext(finalFile);
        } catch (err) {
            setError(String(err));
        }
    };

    const isEncoding = jobState === "staging" || jobState === "probing" || jobState === "encoding" || jobState === "verifying";
    const isLast = currentBatchIndex === totalInBatch - 1;

    return (
        <Modal
            {...props}
            title="Compress Video"
            subtitle={`Destination: ${context.channelId}`}
            size="md"
            notice={error ? { type: "critical", message: error } : undefined}
            actions={[
                { text: totalInBatch > 1 ? "Cancel Batch" : "Cancel", variant: "secondary", onClick: () => {
                    if (isEncoding) {
                        Native.cancelJob(jobId).catch(() => {});
                    } else {
                        onCancelAll();
                    }
                }},
                { text: jobState === "ready" ? (isLast ? "Attach Video" : "Attach & Next") : "Compress", variant: "primary", disabled: isEncoding || (jobState === "ready" && !outputSize), onClick: jobState === "ready" ? attach : startEncode }
            ]}
        >
            <div className="venvid-compression">

                {url && (
                    <VideoPreview 
                        url={url} 
                        onTimeUpdate={setCurrentTime} 
                        onDurationChange={setDuration} 
                        seekTime={seekTime} 
                    />
                )}

                <TrimTimeline 
                    duration={duration} 
                    currentTime={currentTime} 
                    trimStart={trimStart} 
                    trimEnd={trimEnd} 
                    onTrimStartChange={setTrimStart} 
                    onTrimEndChange={setTrimEnd} 
                    onSeek={setSeekTime} 
                />

                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={removeAudio} onChange={e => setRemoveAudio(e.target.checked)} disabled={isEncoding} />
                        Remove Audio
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
                        Resolution:
                        <select value={resolution || ""} onChange={e => setResolution(e.target.value as any || undefined)} disabled={isEncoding}>
                            <option value="">Auto</option>
                            <option value="1080">1080p</option>
                            <option value="720">720p</option>
                            <option value="480">480p</option>
                            <option value="360">360p</option>
                        </select>
                    </label>
                    <div style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                        {jobState === "ready" && outputSize ? (
                            <strong>Final: {formatBytes(outputSize)}</strong>
                        ) : (
                            <span>Est: {formatBytes(estimatedSize)}</span>
                        )}
                    </div>
                </div>

                {totalInBatch > 1 && (
                    <div className="venvid-batch-nav">
                        <button
                            className="venvid-nav-arrow"
                            disabled={currentBatchIndex === 0 || isEncoding}
                            onClick={onPrev}
                            aria-label="Previous video"
                        >
                            ◀
                        </button>
                        <span>{currentBatchIndex + 1} / {totalInBatch}</span>
                        <button
                            className="venvid-nav-arrow"
                            disabled={currentBatchIndex === totalInBatch - 1 || isEncoding}
                            onClick={() => onNext()}
                            aria-label="Next video"
                        >
                            ▶
                        </button>
                    </div>
                )}

                {isEncoding && (
                    <div>
                        <Paragraph>{statusMsg} ({progress.toFixed(1)}%)</Paragraph>
                        <progress value={progress} max={100} style={{ width: "100%" }} />
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
        const fileIndex = context.indices[currentBatchIndex];
        if (replacement) {
            replacements.set(fileIndex, replacement);
        }

        if (currentBatchIndex < context.indices.length - 1) {
            setCurrentBatchIndex(currentBatchIndex + 1);
        } else {
            context.attach(replacements);
            props.onClose();
        }
    };

    const handlePrev = () => {
        if (currentBatchIndex > 0) {
            setCurrentBatchIndex(currentBatchIndex - 1);
        }
    };

    const handleCancelAll = () => {
        props.onClose();
    };

    return (
        <CompressionEditor 
            key={currentBatchIndex}
            {...props}
            context={context}
            fileIndex={context.indices[currentBatchIndex]}
            currentBatchIndex={currentBatchIndex}
            totalInBatch={context.indices.length}
            onNext={handleNext}
            onPrev={handlePrev}
            onCancelAll={handleCancelAll}
        />
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
