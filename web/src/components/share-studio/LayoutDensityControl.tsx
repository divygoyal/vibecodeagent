'use client';

import { Rows3, Rows2, Rows4 } from 'lucide-react';
import type { LayoutDensity } from '@/types/dashboard';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';

const OPTIONS: { value: LayoutDensity; label: string; icon: typeof Rows3 }[] = [
  { value: 'compact', label: 'Compact', icon: Rows4 },
  { value: 'normal', label: 'Normal', icon: Rows3 },
  { value: 'spacious', label: 'Spacious', icon: Rows2 },
];

export default function LayoutDensityControl() {
  const density = useDashboardBuilderStore((s) => s.theme.layoutDensity ?? 'normal');
  const setLayoutDensity = useDashboardBuilderStore((s) => s.setLayoutDensity);

  return (
    <div>
      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2 px-1">
        Layout Density
      </p>
      <div className="grid grid-cols-3 gap-1.5 px-1">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = density === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setLayoutDensity(opt.value)}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg border transition-all ${
                active
                  ? 'bg-[var(--db-primary)]/15 border-[var(--db-primary)]/40 text-[var(--db-primary)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/[0.12]'
              }`}
              title={opt.label}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-medium uppercase tracking-wider">{opt.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-white/30 mt-1.5 px-1 leading-relaxed">
        Adjusts gaps and padding between widgets in the public view.
      </p>
    </div>
  );
}
