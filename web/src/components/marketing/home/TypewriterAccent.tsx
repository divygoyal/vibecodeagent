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

    return (
        <>
            {text}
            <span
                aria-hidden="true"
                className="ml-[0.04em] inline-block w-[0.06em] h-[0.78em] translate-y-[0.06em] rounded-sm bg-[#7AD9DA] animate-pulse"
            />
        </>
    );
}
