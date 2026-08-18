'use client';

import { useCallback, useMemo } from 'react';
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import { GripVertical, Trash2, Copy, Settings2 } from 'lucide-react';
import type { WidgetConfig, GridLayouts, LayoutItem, DashboardFilter } from '@/types/dashboard';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import { applyDashboardFilters } from '@/lib/dashboardFilterEngine';
import WidgetRenderer from './WidgetRenderer';

import 'react-grid-layout/css/styles.css';

// ── Types ──

interface DashboardGridProps {
  widgets: WidgetConfig[];
  gridLayouts: GridLayouts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  widgetData?: Record<string, any>;
  isLoading?: boolean;
  isEditing?: boolean;
  activeFilters?: DashboardFilter[];
  onLayoutChange?: (layout: LayoutItem[], allLayouts: GridLayouts) => void;
  onInteraction?: (widgetId: string, dimension: string, value: string) => void;
}

// ── Grid ──

const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 };
const COLS = { lg: 12, md: 6, sm: 1 };
const ROW_HEIGHT = 80;

export default function DashboardGrid({
  widgets,
  gridLayouts,
  widgetData,
  isLoading,
  isEditing = false,
  activeFilters = [],
  onLayoutChange,
  onInteraction,
}: DashboardGridProps) {
  const { selectWidget, selectedWidgetId, removeWidget, duplicateWidget, updateWidget } =
    useDashboardBuilderStore();

  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  const handleLayoutChange = useCallback(
    (layout: Layout, allLayouts: ResponsiveLayouts) => {
      onLayoutChange?.(
        layout as unknown as LayoutItem[],
        allLayouts as unknown as GridLayouts,
      );
    },
    [onLayoutChange],
  );

  // Apply active cross-widget filters to widget data
  const filteredData = useMemo(() => {
    if (!widgetData || !activeFilters.length) return widgetData;
    return applyDashboardFilters(widgetData, widgets, activeFilters);
  }, [widgetData, widgets, activeFilters]);

  if (!widgets.length) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <GripVertical className="w-6 h-6 text-white/20" />
          </div>
          <p className="text-sm text-[var(--db-text)]/40 mb-1">No widgets yet</p>
          <p className="text-xs text-[var(--db-text)]/25">
            {isEditing ? 'Drag widgets from the palette or click to add' : 'This dashboard is empty'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {mounted && (
        <ResponsiveGridLayout
          className="dashboard-grid"
          width={width}
          layouts={gridLayouts as unknown as ResponsiveLayouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          dragConfig={{ enabled: isEditing, handle: '.widget-drag-handle', bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: isEditing, handles: ['se'] as const }}
          onLayoutChange={handleLayoutChange}
          compactor={verticalCompactor}
          margin={[16, 16] as const}
          containerPadding={[0, 0] as const}
        >
          {widgets.map((widget) => {
            const isSelected = selectedWidgetId === widget.id;
            const data = filteredData?.[widget.id];

            // Check if this widget has an active filter (it's a filter source)
            const isFilterSource = activeFilters.some((f) => f.sourceWidgetId === widget.id);

            return (
              <div
                key={widget.id}
                className={`group relative rounded-[var(--db-radius)] overflow-hidden transition-shadow ${
                  isSelected && isEditing
                    ? 'ring-2 ring-[var(--db-primary)] shadow-lg shadow-[var(--db-primary)]/10'
                    : isFilterSource
                      ? 'ring-2 ring-cyan-400/40 shadow-md shadow-cyan-400/5'
                      : 'ring-1 ring-white/[0.06]'
                }`}
                style={{ backgroundColor: 'var(--db-card)' }}
                onClick={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                    selectWidget(widget.id);
                  }
                }}
              >
                {/* Drag handle + action buttons (edit mode only) */}
                {isEditing && (
                  <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="widget-drag-handle cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-white/10 transition-colors">
                      <GripVertical className="w-3.5 h-3.5 text-[var(--db-text)]/40" />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); selectWidget(widget.id); }}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Configure"
                      >
                        <Settings2 className="w-3 h-3 text-[var(--db-text)]/40" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateWidget(widget.id); }}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="w-3 h-3 text-[var(--db-text)]/40" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}
                        className="p-1 rounded hover:bg-red-500/20 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3 text-red-400/60" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Widget content */}
                <div className="h-full">
                  <WidgetRenderer
                    config={widget}
                    data={data}
                    isLoading={isLoading}
                    isEditing={isEditing}
                    onContentChange={
                      widget.type === 'text' && isEditing
                        ? (content) => updateWidget(widget.id, { content })
                        : undefined
                    }
                    onInteraction={
                      onInteraction
                        ? (dimension, value) => onInteraction(widget.id, dimension, value)
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
