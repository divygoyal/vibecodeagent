'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    glow?: 'blue' | 'emerald' | 'violet' | 'amber' | 'none';
    onClick?: () => void;
    active?: boolean;
}

const GLOW_COLORS = {
    blue: 'hover:shadow-blue-500/[0.06]',
    emerald: 'hover:shadow-emerald-500/[0.06]',
    violet: 'hover:shadow-violet-500/[0.06]',
    amber: 'hover:shadow-amber-500/[0.06]',
    none: '',
};

export default function GlassCard({ children, className = '', hover = true, glow = 'blue', onClick, active }: GlassCardProps) {
    return (
        <motion.div
            whileHover={hover ? { y: -1, scale: 1.002 } : undefined}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={onClick}
            className={`
                relative rounded-2xl
                bg-[var(--card-bg)] backdrop-blur-sm
                border border-[var(--card-border)]
                ${hover ? `hover:border-[var(--card-hover)] hover:bg-[var(--card-hover)] ${GLOW_COLORS[glow]} hover:shadow-lg` : ''}
                ${active ? 'border-emerald-500/30 bg-emerald-500/[0.04] shadow-emerald-500/[0.08] shadow-lg' : ''}
                ${onClick ? 'cursor-pointer' : ''}
                transition-colors duration-200
                ${className}
            `}
        >
            {children}
        </motion.div>
    );
}
