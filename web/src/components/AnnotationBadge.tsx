'use client';
import React from 'react';
import { TrendingDown, Sparkles, AlertTriangle, Target, Ghost } from 'lucide-react';

type BadgeType = 'Decaying' | 'Opportunity' | 'Cannibalizing' | 'Striking Distance' | 'Zombie';

interface AnnotationBadgeProps {
  type: BadgeType;
  className?: string;
}

const config: Record<BadgeType, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  'Decaying': { icon: TrendingDown, bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  'Opportunity': { icon: Sparkles, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  'Cannibalizing': { icon: AlertTriangle, bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  'Striking Distance': { icon: Target, bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  'Zombie': { icon: Ghost, bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
};

export function AnnotationBadge({ type, className = '' }: AnnotationBadgeProps) {
  const { icon: Icon, bg, text, border } = config[type];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${bg} ${text} ${border} ${className}`}>
      <Icon className="w-2.5 h-2.5" />
      {type}
    </span>
  );
}

// Helper to auto-detect annotations from data
export function getAnnotations(data: { position?: number; ctr?: number; clicks?: number; impressions?: number; change?: number }): BadgeType[] {
  const badges: BadgeType[] = [];
  if (data.position && data.position >= 11 && data.position <= 20) badges.push('Striking Distance');
  if (data.ctr !== undefined && data.position !== undefined && data.position <= 10) {
    const benchmarks: Record<number, number> = {1: 0.317, 2: 0.247, 3: 0.187, 4: 0.136, 5: 0.095, 6: 0.062, 7: 0.042, 8: 0.031, 9: 0.024, 10: 0.019};
    const expected = benchmarks[Math.round(data.position)] || 0.019;
    if (data.ctr < expected * 0.75) badges.push('Opportunity');
  }
  if (data.clicks === 0 && (data.impressions || 0) > 0) badges.push('Zombie');
  if (data.change !== undefined && data.change < -20) badges.push('Decaying');
  return badges;
}
