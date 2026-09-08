/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useEffect, useRef } from "@webpack/common";

interface PreviewProps {
    url: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
    scrubbing: React.RefObject<boolean>;
}

export function VideoPreview({ url, videoRef, onTimeUpdate, onDurationChange, scrubbing }: PreviewProps) {
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        let frame = 0;
        const update = () => {
            if (!scrubbing.current && !video.seeking) onTimeUpdate(video.currentTime);
        };
        const tick = () => {
            update();
            frame = requestAnimationFrame(tick);
        };
        const start = () => {
            cancelAnimationFrame(frame);
            tick();
        };
        const stop = () => {
            cancelAnimationFrame(frame);
            update();
        };
        video.addEventListener("play", start);
        video.addEventListener("pause", stop);
        video.addEventListener("seeked", update);
        if (!video.paused) start();
        return () => {
            cancelAnimationFrame(frame);
            video.removeEventListener("play", start);
            video.removeEventListener("pause", stop);
            video.removeEventListener("seeked", update);
        };
    }, [url, onTimeUpdate]);

    return (
        <div className="venvid-preview-container">
            <video
                ref={videoRef}
                src={url}
                controls
                preload="metadata"
                onLoadedMetadata={e => {
                    const { duration } = e.currentTarget;
                    if (Number.isFinite(duration) && duration > 0) onDurationChange(duration);
                }}
            />
        </div>
    );
}

interface TimelineProps {
    duration: number;
    currentTime: number;
    trimStart: number;
    trimEnd: number;
    disabled: boolean;
    onTrimStartChange: (time: number) => void;
    onTrimEndChange: (time: number) => void;
    onSeek: (time: number) => void;
    onScrubStart: () => void;
    onScrubEnd: () => void;
}

type DragTarget = "start" | "end" | "playhead";

export function TrimTimeline({ duration, currentTime, trimStart, trimEnd, disabled, onTrimStartChange, onTrimEndChange, onSeek, onScrubStart, onScrubEnd }: TimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ target: DragTarget; pointerId: number; offset: number; } | null>(null);
    const minSelection = Math.min(0.1, duration);
    const enabled = duration > 0;
    const percent = (time: number) => enabled ? Math.max(0, Math.min(100, time / duration * 100)) : 0;

    const positionToTime = (clientX: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        return rect?.width && enabled ? (clientX - rect.left) / rect.width * duration : 0;
    };
    const changeTime = (target: DragTarget, time: number) => {
        if (target === "start") {
            const start = Math.max(0, Math.min(trimEnd - minSelection, time));
            onTrimStartChange(start);
            onSeek(start);
        } else if (target === "end") {
            const end = Math.min(duration, Math.max(trimStart + minSelection, time));
            onTrimEndChange(end);
            onSeek(end);
        } else onSeek(Math.max(0, Math.min(duration, time)));
    };
    const beginDrag = (e: React.PointerEvent<HTMLDivElement>, target: DragTarget) => {
        if (!enabled || e.button !== 0 || drag.current || (disabled && target !== "playhead")) return;
        e.preventDefault();
        e.stopPropagation();
        const time = positionToTime(e.clientX);
        const offset = target === "start" ? time - trimStart : target === "end" ? time - trimEnd : 0;
        drag.current = { target, pointerId: e.pointerId, offset };
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrubStart();
        changeTime(target, time - offset);
    };
    const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        const active = drag.current;
        if (active?.pointerId === e.pointerId) changeTime(active.target, positionToTime(e.clientX) - active.offset);
    };
    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== e.pointerId) return;
        if (e.type === "pointerup") moveDrag(e);
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        onScrubEnd();
    };
    const onKeyDown = (e: React.KeyboardEvent, target: DragTarget, value: number) => {
        if (!enabled || (disabled && target !== "playhead")) return;
        const step = e.shiftKey ? 1 : 0.1;
        const time = e.key === "Home" ? 0 : e.key === "End" ? duration
            : e.key === "ArrowLeft" || e.key === "ArrowDown" ? value - step
                : e.key === "ArrowRight" || e.key === "ArrowUp" ? value + step : undefined;
        if (time === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        changeTime(target, time);
    };
    const startPct = percent(trimStart);
    const endPct = percent(trimEnd);

    return (
        <div className="venvid-timeline-container">
            <div className="venvid-timeline-summary">
                <span>{currentTime.toFixed(2)}s <span className="venvid-muted">/ {duration.toFixed(2)}s</span></span>
                <span className="venvid-muted">Selected: {(trimEnd - trimStart).toFixed(2)}s</span>
            </div>
            <div
                className="venvid-trim-track"
                ref={trackRef}
                onPointerDown={e => beginDrag(e, "playhead")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
            >
                <div className="venvid-trim-region" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
                <div
                    className="venvid-trim-playhead"
                    style={{ left: `${percent(currentTime)}%` }}
                    role="slider"
                    aria-label="Preview position"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={currentTime}
                    aria-valuetext={`${currentTime.toFixed(2)} seconds`}
                    tabIndex={enabled ? 0 : -1}
                    onKeyDown={e => onKeyDown(e, "playhead", currentTime)}
                />
                {(["start", "end"] as const).map(target => {
                    const value = target === "start" ? trimStart : trimEnd;
                    return (
                        <div
                            key={target}
                            className="venvid-trim-handle"
                            style={{ left: `${percent(value)}%` }}
                            role="slider"
                            aria-label={`Trim ${target}`}
                            aria-valuemin={target === "start" ? 0 : trimStart + minSelection}
                            aria-valuemax={target === "start" ? Math.max(0, trimEnd - minSelection) : duration}
                            aria-valuenow={value}
                            aria-valuetext={`${value.toFixed(2)} seconds`}
                            aria-disabled={disabled || !enabled}
                            tabIndex={!disabled && enabled ? 0 : -1}
                            onPointerDown={e => beginDrag(e, target)}
                            onKeyDown={e => onKeyDown(e, target, value)}
                        />
                    );
                })}
            </div>
            <div className="venvid-trim-fields">
                <label>Start
                    <input type="number" min={0} max={Math.max(0, trimEnd - minSelection)} step={0.1}
                        value={trimStart.toFixed(2)} disabled={disabled || !enabled}
                        onChange={e => {
                            if (Number.isFinite(e.target.valueAsNumber)) changeTime("start", e.target.valueAsNumber);
                        }} />
                    <span className="venvid-muted">s</span>
                </label>
                <label>End
                    <input type="number" min={trimStart + minSelection} max={duration} step={0.1}
                        value={trimEnd.toFixed(2)} disabled={disabled || !enabled}
                        onChange={e => {
                            if (Number.isFinite(e.target.valueAsNumber)) changeTime("end", e.target.valueAsNumber);
                        }} />
                    <span className="venvid-muted">s</span>
                </label>
            </div>
        </div>
    );
}
