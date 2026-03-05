'use client';

import { memo } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

const iconColor: Record<string, string> = {
  emerald: 'from-emerald-400 to-emerald-600',
  cyan: 'from-cyan-400 to-blue-500',
  violet: 'from-violet-400 to-purple-600',
  amber: 'from-amber-400 to-orange-500',
};

interface ActionCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}

function ActionCardInner({ href, icon: Icon, title, description, color }: ActionCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all group"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconColor[color]} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">{title}</div>
        <div className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">{description}</div>
      </div>
      <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0" />
    </Link>
  );
}

const ActionCard = memo(ActionCardInner);
export default ActionCard;
