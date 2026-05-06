'use client';

import { Component, type ReactNode } from 'react';

interface Props {
    /** Optional label shown in the fallback ("thinking", "tool result", etc.) */
    label?: string;
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

/**
 * Per-section error boundary used inside chat messages so a malformed tool
 * result, broken markdown, or unexpected chart payload only takes down ONE
 * section — not the entire chat window. Without this, a single bad JSON
 * crashes ChatMessageRenderer and the user sees a blank message.
 */
export default class ChatErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        if (process.env.NODE_ENV === 'development') {
            console.error(`[chat-error-boundary] ${this.props.label || 'section'} crashed:`, error);
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="my-2 rounded-lg border border-red-500/15 bg-red-500/[0.04] px-3 py-2 text-[12px] text-red-300">
                    Couldn&apos;t render this {this.props.label || 'section'}. The rest of the message is unaffected.
                </div>
            );
        }
        return this.props.children;
    }
}
