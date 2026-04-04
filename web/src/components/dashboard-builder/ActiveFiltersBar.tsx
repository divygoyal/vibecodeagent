'use client';

import { X, Filter, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DashboardFilter } from '@/types/dashboard';
import { formatDimensionLabel } from '@/lib/dashboardFilterEngine';

interface ActiveFiltersBarProps {
  filters: DashboardFilter[];
  onRemove: (filterId: string) => void;
  onClearAll: () => void;
}

export default function ActiveFiltersBar({ filters, onRemove, onClearAll }: ActiveFiltersBarProps) {
  if (!filters.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 flex-wrap mb-3"
    >
      <div className="flex items-center gap-1 text-[10px] text-cyan-400/60 font-medium uppercase tracking-wider flex-shrink-0">
        <Filter className="w-3 h-3" />
        Filters
      </div>

      <AnimatePresence mode="popLayout">
        {filters.map((filter) => (
          <motion.button
            key={filter.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => onRemove(filter.id)}
            className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-400/10 border border-cyan-400/20 text-[10px] text-cyan-300/80 hover:bg-cyan-400/15 hover:border-cyan-400/30 transition-colors"
            title={`Remove filter: ${formatDimensionLabel(filter.dimension)} = ${filter.value}`}
          >
            <span className="text-cyan-400/50 font-medium">
              {formatDimensionLabel(filter.dimension)}:
            </span>
            <span className="max-w-[120px] truncate">{filter.value}</span>
            <X className="w-2.5 h-2.5 text-cyan-400/40 group-hover:text-cyan-400/70 transition-colors flex-shrink-0" />
          </motion.button>
        ))}
      </AnimatePresence>

      {filters.length > 1 && (
        <button
          onClick={onClearAll}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
          title="Clear all filters"
        >
          <XCircle className="w-3 h-3" />
          Clear all
        </button>
      )}
    </motion.div>
  );
}
