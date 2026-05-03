'use client';

import { Check } from 'lucide-react';
import type { DashboardSectionVisibility } from '@/types/dashboard';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import { SECTION_LABELS, SECTION_DESCRIPTIONS } from '@/lib/widgetSections';

const DEFAULT: DashboardSectionVisibility = {
  traffic: true,
  sources: true,
  pages: true,
  geo: true,
  technology: true,
  seo: true,
};

export default function SectionVisibilityToggles() {
  const visibility = useDashboardBuilderStore((s) => s.theme.sectionVisibility ?? DEFAULT);
  const setSectionVisibility = useDashboardBuilderStore((s) => s.setSectionVisibility);

  const sections = Object.keys(SECTION_LABELS) as Array<keyof DashboardSectionVisibility>;

  return (
    <div>
      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2 px-1">
        Sections
      </p>
      <div className="space-y-1 px-1">
        {sections.map((section) => {
          const enabled = visibility[section];
          return (
            <button
              key={section}
              onClick={() => setSectionVisibility({ [section]: !enabled })}
              className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg border transition-all text-left ${
                enabled
                  ? 'bg-[var(--db-primary)]/[0.06] border-[var(--db-primary)]/20'
                  : 'bg-white/[0.02] border-white/[0.04] opacity-60'
              }`}
            >
              <span
                className={`mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  enabled
                    ? 'bg-[var(--db-primary)] text-white'
                    : 'bg-white/[0.05] border border-white/[0.1]'
                }`}
              >
                {enabled && <Check className="w-2.5 h-2.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-xs font-medium ${
                    enabled ? 'text-white/80' : 'text-white/40'
                  }`}
                >
                  {SECTION_LABELS[section]}
                </span>
                <span className="block text-[10px] text-white/30 mt-0.5">
                  {SECTION_DESCRIPTIONS[section]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-white/30 mt-1.5 px-1 leading-relaxed">
        Hide entire sections from the shared view without removing widgets.
      </p>
    </div>
  );
}
