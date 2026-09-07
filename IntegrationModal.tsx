/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Caicheng Li
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import type { RenderModalProps } from "@vencord/discord-types";
import { closeModal, Modal, openModal, useEffect, useState } from "@webpack/common";

import { formatBytes } from "./limits";
import { createProofFile } from "./proofVideo";
import type { ProofContext } from "./uploadAdapter";

function IntegrationModal({ context, ...props }: RenderModalProps & { context: ProofContext; }) {
    const [accepted, setAccepted] = useState(false);
    const [file, setFile] = useState<File>();
    const [url, setUrl] = useState<string>();
    const [playable, setPlayable] = useState(false);
    const [error, setError] = useState<string>();
    const original = context.attempt.files[context.index];

    useEffect(() => {
        if (!file) return;
        const preview = URL.createObjectURL(file);
        setUrl(preview);
        setPlayable(false);
        return () => URL.revokeObjectURL(preview);
    }, [file]);

    function generate() {
        try {
            setFile(createProofFile(original.name));
            setError(undefined);
        } catch (error) {
            setError(String(error));
        }
    }

    function attach() {
        try {
            if (!file || !playable) return;
            context.attach(file);
            props.onClose();
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    }

    return (
        <Modal
            {...props}
            title={accepted ? "VenVid attachment test" : "Oversized video"}
            subtitle={`Destination: ${context.channelId}`}
            size="md"
            notice={error ? { type: "critical", message: error } : undefined}
            actions={accepted ? [
                { text: "Cancel", variant: "secondary", onClick: props.onClose },
                { text: "Attach test video", variant: "primary", disabled: !file || !playable, onClick: attach }
            ] : [
                { text: "No, continue normally", variant: "secondary", onClick: props.onClose },
                { text: "Yes, test replacement", variant: "primary", onClick: () => setAccepted(true) }
            ]}
        >
            <div className="venvid-proof">
                <Paragraph>{original.name}</Paragraph>
                <Paragraph>This video is {formatBytes(original.size)}. The upload limit here is {formatBytes(context.limit)}.</Paragraph>
                <Paragraph>
                    This integration test replaces the selected video with a one-second blue test clip.
                    It does not compress your video. The original file stays intact, and Discord will leave the replacement in the draft for you to send.
                </Paragraph>
                {context.attempt.files.length > 1 && <Paragraph>The other {context.attempt.files.length - 1} files will stay in their original order.</Paragraph>}
                {accepted && <>
                    <Button onClick={generate}>Generate test MP4</Button>
                    {file && <Paragraph>Test output: {formatBytes(file.size)}</Paragraph>}
                    {url && <video
                        className="venvid-proof-preview"
                        src={url}
                        controls
                        preload="auto"
                        aria-label="Generated one-second blue test video"
                        onLoadedData={event => {
                            const video = event.currentTarget;
                            setPlayable(video.videoWidth > 0 && Number.isFinite(video.duration) && video.duration > 0);
                        }}
                        onError={() => {
                            setPlayable(false);
                            setError("Discord could not play the test MP4. Attachment is disabled.");
                        }}
                    />}
                </>}
            </div>
        </Modal>
    );
}

export function openProofModal(context: ProofContext): () => void {
    const key = openModal(props => (
        <ErrorBoundary onError={() => {
            context.attempt.continue();
            props.onClose();
        }}>
            <IntegrationModal {...props} context={context} />
        </ErrorBoundary>
    ), {
        modalKey: `venvid-${context.attempt.id}`,
        onCloseCallback: () => { context.attempt.continue(); }
    });
    return () => closeModal(key);
}
