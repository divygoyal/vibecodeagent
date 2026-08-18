'use client';

import { motion } from 'framer-motion';
import {
  TrendingUp, AreaChart, BarChart3, PieChart, Table, Type, Search, FileSearch, Plus,
} from 'lucide-react';
import type { WidgetType } from '@/types/dashboard';
import { WIDGET_REGISTRY } from '@/lib/dashboardBuilder';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';

// ── Icon map ──

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  AreaChart,
  BarChart3,
  PieChart,
  Table,
  Type,
  Search,
  FileSearch,
};

// ── Categories ──

const CATEGORIES = [
  { id: 'analytics' as const, label: 'Analytics' },
  { id: 'seo' as const, label: 'SEO' },
  { id: 'content' as const, label: 'Content' },
];

export default function WidgetPalette() {
  const addWidget = useDashboardBuilderStore((s) => s.addWidget);

  const widgetsByCategory = CATEGORIES.map((cat) => ({
    ...cat,
    widgets: Object.values(WIDGET_REGISTRY).filter((w) => w.category === cat.id),
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-1">
        Widgets
      </h3>

      {widgetsByCategory.map((cat) => (
        <div key={cat.id}>
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2 px-1">
            {cat.label}
          </p>
          <div className="space-y-1">
            {cat.widgets.map((meta) => {
              const Icon = ICON_MAP[meta.icon] || Plus;

              return (
                <motion.button
                  key={meta.type}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => addWidget(meta.type)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.08] transition-all text-left group"
                >
                  <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--db-primary)]/10 transition-colors">
                    <Icon className="w-3.5 h-3.5 text-white/40 group-hover:text-[var(--db-primary)] transition-colors" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white/70 group-hover:text-white/90 truncate transition-colors">
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-white/30 truncate">
                      {meta.description}
                    </p>
                  </div>
                  <Plus className="w-3 h-3 text-white/20 group-hover:text-white/40 flex-shrink-0 transition-colors" />
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
