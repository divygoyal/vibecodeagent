'use client';

import { useEffect, useState } from 'react';

interface TypewriterAccentProps {
    phrases: string[];
    typeMs?: number;
    holdMs?: number;
    eraseMs?: number;
}

export default function TypewriterAccent({
    phrases,
    typeMs = 65,
    holdMs = 1800,
    eraseMs = 35,
}: TypewriterAccentProps) {
    const [index, setIndex] = useState(0);
    const [text, setText] = useState('');
    const [phase, setPhase] = useState<'typing' | 'hold' | 'erasing'>('typing');

    useEffect(() => {
        const current = phrases[index] ?? '';
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (phase === 'typing') {
            if (text.length < current.length) {
                timer = setTimeout(() => {
                    setText(current.slice(0, text.length + 1));
                }, typeMs);
            } else {
                setPhase('hold');
            }
        } else if (phase === 'hold') {
            timer = setTimeout(() => setPhase('erasing'), holdMs);
        } else if (text.length > 0) {
            timer = setTimeout(() => {
                setText(current.slice(0, text.length - 1));
            }, eraseMs);
        } else {
            setIndex((prev) => (prev + 1) % phrases.length);
            setPhase('typing');
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [text, phase, index, phrases, typeMs, holdMs, eraseMs]);

    // translate="no" + notranslate class: the text state updates every ~65ms
    // while Chrome auto-translate concurrently wraps text nodes in <font> tags.
    // The two collide and React reconciliation either crashes (without the
    // root-layout patch) or accumulates stale fragments from prior animation
    // frames (with it). The rotating phrases here are product names — Google
    // Analytics, Search Console — that aren't typically translated anyway, so
    // leaving them English is the right call. Everything else in the hero
    // (eyebrow, lead line, subtitle, CTAs) keeps translating normally.
    return (
        <span translate="no" className="notranslate">
            {text}
            <span
                aria-hidden="true"
                className="ml-[0.04em] inline-block w-[0.06em] h-[0.78em] translate-y-[0.06em] rounded-sm bg-[#7AD9DA] animate-pulse"
            />
        </span>
    );
}
