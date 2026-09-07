/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function isValidLimit(limit: unknown): limit is number {
    return typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0;
}

export function isOversizedVideo(file: Pick<File, "name" | "type" | "size">, limit: number) {
    const video = file.type.startsWith("video/")
        || ((!file.type || file.type === "application/octet-stream") && /\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg|mts|m2ts)$/i.test(file.name));
    return isValidLimit(limit) && video && file.size > limit;
}

/** One terminal decision, even when close, attach, and shutdown race. */
export class UploadAttempt {
    readonly id = crypto.randomUUID();
    readonly completion: Promise<void>;
    private state: "pending" | "resuming" | "finished" | "invalidated" = "pending";
    private resolve!: () => void;
    private reject!: (error: unknown) => void;

    constructor(private resume: (files: File[]) => Promise<void>, readonly files: readonly File[]) {
        this.completion = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    get pending() {
        return this.state === "pending";
    }

    continue(files: readonly File[] = this.files): boolean {
        if (!this.pending) return false;
        this.state = "resuming";
        try {
            const result = this.resume([...files]);
            void Promise.resolve(result).then(() => {
                this.state = "finished";
                this.resolve();
            }, error => {
                this.state = "finished";
                this.reject(error);
            });
        } catch (error) {
            this.state = "finished";
            this.reject(error);
        }
        return true;
    }

    invalidate() {
        if (!this.pending) return;
        this.state = "invalidated";
        this.resolve();
    }
}
