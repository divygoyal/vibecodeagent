'use client';
import React from 'react';
import { ShoppingCart, Download, Navigation, BookOpen } from 'lucide-react';

type IntentType = 'Commercial' | 'Transactional' | 'Navigational' | 'Informational';

interface IntentBadgeProps {
  keyword: string;
  className?: string;
}

const intentConfig: Record<IntentType, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  'Commercial': { icon: ShoppingCart, bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  'Transactional': { icon: Download, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  'Navigational': { icon: Navigation, bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  'Informational': { icon: BookOpen, bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
};

export function classifyIntent(keyword: string): IntentType {
  const lower = keyword.toLowerCase();
  if (/\b(buy|order|purchase|download|deal|discount|coupon|price|cheap|pricing)\b/.test(lower)) return 'Transactional';
  if (/\b(best|top|review|compare|vs|versus|alternative|comparison)\b/.test(lower)) return 'Commercial';
  if (/\b(login|sign\s?in|dashboard|account|portal)\b/.test(lower)) return 'Navigational';
  if (/\b(how|what|why|when|where|who|guide|tutorial|tips|learn|meaning|definition|example)\b/.test(lower)) return 'Informational';
  return 'Informational';
}

export function IntentBadge({ keyword, className = '' }: IntentBadgeProps) {
  const intent = classifyIntent(keyword);
  const { icon: Icon, bg, text, border } = intentConfig[intent];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${bg} ${text} ${border} ${className}`}>
      <Icon className="w-2.5 h-2.5" />
      {intent}
    </span>
  );
}
