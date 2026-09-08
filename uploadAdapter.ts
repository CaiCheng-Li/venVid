/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import type { Channel } from "@vencord/discord-types";
import { ChannelStore, PermissionsBits, PermissionStore, showToast } from "@webpack/common";

import { isOversizedVideo, UploadAttempt } from "./attempt";
import { openCompressionModal } from "./CompressionModal";
import { resolveLimit } from "./limits";

interface UploadOptions {
    requireConfirm?: boolean;
    isThumbnail?: boolean;
    filesMetadata?: Record<string, unknown>[];
    origin?: string;
}

type UploadArgs = [File[] | FileList, Channel, number, UploadOptions?, ...unknown[]];
type UploadFunction = (...args: UploadArgs) => Promise<void>;

export interface ProofContext {
    attempt: UploadAttempt;
    channelId: string;
    guildId?: string;
    draftType: number;
    indices: number[];
    limit: number;
    origin?: string;
    attach(replacements: Map<number, File>): void;
}

const logger = new Logger("VenVid");
const bypass = new WeakSet<object>();
const pending = new Map<UploadAttempt, () => void>();
let active = false;
let warned = false;

function notice(message: string) {
    if (warned) return;
    warned = true;
    try { showToast(message); } catch (error) { logger.warn(message, error); }
}

export function startAdapter() {
    active = true;
    warned = false;
}

export function stopAdapter() {
    active = false;
    for (const [attempt, close] of pending) {
        attempt.invalidate();
        try { close(); } catch (error) { logger.error("Could not close proof modal", error); }
    }
    pending.clear();
}

/** Called inside Discord's original async function, before its first await or size check. */
export function intercept(original: UploadFunction, receiver: unknown, rawArgs: IArguments): Promise<void> | undefined {
    const args = Array.from(rawArgs) as UploadArgs;
    if (bypass.delete(args[0])) return;
    if (!active) return;

    try {
        const [input, channel, draftType, options] = args;
        // Instant-send and thumbnail operations are outside the draft-only integration proof.
        if (!(Array.isArray(input) || typeof FileList !== "undefined" && input instanceof FileList)
            || !input.length || !channel?.id || !Number.isInteger(draftType)
            || (options?.requireConfirm !== undefined && options.requireConfirm !== true) || options?.isThumbnail) return;
        const files = Array.from(input);
        if (!files.every(file => file instanceof File)) return;
        if (options?.filesMetadata && (options.filesMetadata.length !== files.length
            || options.filesMetadata.some(metadata => metadata && Object.hasOwn(metadata, "file")))) return;
        const guildId = channel.getGuildId();
        const limit = resolveLimit(guildId);
        if (limit == null) {
            notice("VenVid could not read the upload limit. Continuing normally.");
            return;
        }
        const oversized = files.flatMap((file, index) => isOversizedVideo(file, limit) ? [index] : []);
        if (!oversized.length) return;
        const savedArgs = [...args] as UploadArgs;
        if (options) savedArgs[3] = {
            ...options,
            filesMetadata: options.filesMetadata?.map(metadata => ({ ...metadata }))
        };
        const attempt = new UploadAttempt(resumedFiles => {
            savedArgs[0] = resumedFiles;
            bypass.add(resumedFiles);
            try { return original.apply(receiver, savedArgs); }
            finally { bypass.delete(resumedFiles); }
        }, [...files]);

        const context: ProofContext = {
            attempt, channelId: channel.id, guildId, draftType, limit,
            indices: oversized, origin: options?.origin,
            attach(replacements) {
                if (!active || !attempt.pending) throw new Error("This attachment attempt is no longer active.");
                const destination = ChannelStore.getChannel(context.channelId);
                if (!destination || (destination.guild_id && !PermissionStore.can(PermissionsBits.ATTACH_FILES, destination)))
                    throw new Error("The original destination is unavailable or attachments are no longer allowed. Keep this preview or cancel.");
                const currentLimit = resolveLimit(context.guildId);
                if (currentLimit == null) throw new Error("Could not recheck the destination's upload limit. Try again.");

                const finalFiles = [...attempt.files];
                for (const [index, file] of replacements) {
                    if (!(file instanceof File) || file.type !== "video/mp4" || file.size <= 0 || file.size > currentLimit) {
                        throw new Error("One of the replacements is not a valid MP4 within the current upload limit.");
                    }
                    finalFiles[index] = file;
                }

                attempt.continue(finalFiles);
            }
        };
        pending.set(attempt, () => {});
        // The patch remains async; no UI code runs inside the original call's synchronous prefix.
        queueMicrotask(() => {
            if (!active || !attempt.pending) return;
            try { pending.set(attempt, openCompressionModal(context)); }
            catch (error) {
                logger.error("Proof modal failed; continuing original upload", error);
                attempt.continue();
            }
        });
        void attempt.completion.then(() => pending.delete(attempt), error => {
            pending.delete(attempt);
            logger.error("Discord upload continuation failed", error);
            notice("Discord could not resume this attachment. Please select the file again.");
        });
        return attempt.completion;
    } catch (error) {
        logger.error("Upload interception unavailable; continuing normally", error);
        notice("VenVid integration is unavailable. Continuing normally.");
        return;
    }
}
