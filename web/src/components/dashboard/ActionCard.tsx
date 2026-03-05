'use client';

import { memo } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

const colorStyles: Record<string, { gradient: string; glow: string; border: string; text: string }> = {
  emerald: {
    gradient: 'from-emerald-400 to-emerald-600',
    glow: 'group-hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]',
    border: 'group-hover:border-emerald-500/20',
    text: 'group-hover:text-emerald-400',
  },
  cyan: {
    gradient: 'from-cyan-400 to-blue-500',
    glow: 'group-hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]',
    border: 'group-hover:border-cyan-500/20',
    text: 'group-hover:text-cyan-400',
  },
  violet: {
    gradient: 'from-violet-400 to-purple-600',
    glow: 'group-hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]',
    border: 'group-hover:border-violet-500/20',
    text: 'group-hover:text-violet-400',
  },
  amber: {
    gradient: 'from-amber-400 to-orange-500',
    glow: 'group-hover:shadow-[0_0_20px_rgba(251,191,36,0.15)]',
    border: 'group-hover:border-amber-500/20',
    text: 'group-hover:text-amber-400',
  },
};

interface ActionCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}

function ActionCardInner({ href, icon: Icon, title, description, color }: ActionCardProps) {
  const styles = colorStyles[color] || colorStyles.emerald;
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-4 p-4 rounded-2xl bg-[#0a0a12]/80 border border-white/[0.06] ${styles.border} ${styles.glow} hover:bg-white/[0.03] transition-all duration-500 group overflow-hidden`}
    >
      {/* Animated background glow */}
      <div className={`absolute inset-0 bg-gradient-to-r ${styles.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-700`} />

      <div className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${styles.gradient} flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 relative">
        <div className={`text-sm font-semibold text-white ${styles.text} transition-colors duration-300`}>{title}</div>
        <div className="text-[11px] text-zinc-500 group-hover:text-zinc-400 transition-colors duration-300">{description}</div>
      </div>
      <ArrowUpRight className={`w-4 h-4 text-zinc-600 ${styles.text} transition-all duration-300 opacity-0 group-hover:opacity-100 transform translate-x-[-8px] group-hover:translate-x-0`} />
    </Link>
  );
}

const ActionCard = memo(ActionCardInner);
export default ActionCard;
