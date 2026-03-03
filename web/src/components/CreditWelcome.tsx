'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Coins, X } from 'lucide-react';

interface CreditWelcomeProps {
    credits: number;
    onDismiss: () => void;
}

export default function CreditWelcome({ credits, onDismiss }: CreditWelcomeProps) {
    const [visible, setVisible] = useState(false);
    const [countUp, setCountUp] = useState(0);

    useEffect(() => {
        // Animate in
        const timer = setTimeout(() => setVisible(true), 300);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!visible) return;
        // Count up animation  
        const step = Math.max(1, Math.floor(credits / 30));
        const interval = setInterval(() => {
            setCountUp(prev => {
                const next = prev + step;
                if (next >= credits) {
                    clearInterval(interval);
                    return credits;
                }
                return next;
            });
        }, 30);
        return () => clearInterval(interval);
    }, [visible, credits]);

    const dismiss = () => {
        setVisible(false);
        setTimeout(onDismiss, 300);
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-500 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

            {/* Card */}
            <div className={`relative z-10 w-[380px] rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-emerald-500/10 transition-all duration-500 ${visible ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'}`}>
                {/* Gradient header */}
                <div className="bg-gradient-to-br from-emerald-500/20 via-cyan-500/15 to-teal-500/20 px-6 pt-8 pb-6 text-center relative overflow-hidden">
                    {/* Animated sparkles */}
                    <div className="absolute top-4 left-6 opacity-40 animate-pulse"><Sparkles className="w-4 h-4 text-emerald-300" /></div>
                    <div className="absolute top-8 right-8 opacity-30 animate-pulse delay-300"><Sparkles className="w-3 h-3 text-cyan-300" /></div>
                    <div className="absolute bottom-4 left-12 opacity-20 animate-pulse delay-700"><Sparkles className="w-5 h-5 text-teal-300" /></div>

                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30">
                        <Coins className="w-8 h-8 text-black" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">Welcome to TrafficClaw!</h2>
                    <p className="text-zinc-400 text-sm">You&apos;ve been granted free AI messages</p>
                </div>

                {/* Credit counter */}
                <div className="bg-[#0a0a0f] px-6 py-6 text-center">
                    <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-2 tabular-nums">
                        {countUp}
                    </div>
                    <p className="text-zinc-500 text-sm mb-1">AI Messages</p>
                    <p className="text-zinc-600 text-xs">1 credit = 1 message • Start analyzing now</p>
                </div>

                {/* CTA */}
                <div className="bg-[#0a0a0f] px-6 pb-6">
                    <button
                        onClick={dismiss}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                        Start Analyzing →
                    </button>
                </div>

                {/* Close */}
                <button onClick={dismiss} className="absolute top-3 right-3 text-zinc-600 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
