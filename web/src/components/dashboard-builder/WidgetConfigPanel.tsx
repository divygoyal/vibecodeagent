'use client';

import { X, Trash2 } from 'lucide-react';
import type { WidgetConfig, WidgetType, DataSource, DateRange, ChartVariant } from '@/types/dashboard';
import { WIDGET_REGISTRY, GA4_METRICS, GA4_DIMENSIONS, GSC_METRICS } from '@/lib/dashboardBuilder';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';

// ── Helpers ──

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[var(--db-primary)]/50 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[var(--db-primary)]/50 placeholder:text-white/20 transition-colors"
      />
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
        {label}
      </label>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${
          value ? 'bg-[var(--db-primary)]' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ── Component ──

export default function WidgetConfigPanel() {
  const { selectedWidgetId, widgets, updateWidget, removeWidget, selectWidget } =
    useDashboardBuilderStore();

  const widget = widgets.find((w) => w.id === selectedWidgetId);

  if (!widget) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <p className="text-xs text-white/30 text-center">
          Select a widget to configure
        </p>
      </div>
    );
  }

  const meta = WIDGET_REGISTRY[widget.type];
  const isChart = ['area-chart', 'bar-chart', 'donut-chart', 'seo-performance'].includes(widget.type);
  const isGSC = widget.dataSource === 'gsc';
  const isStatic = widget.dataSource === 'static';

  const metricOptions = isGSC
    ? GSC_METRICS.map((m) => ({ value: m.value, label: m.label }))
    : GA4_METRICS.map((m) => ({ value: m.value, label: m.label }));

  const dimensionOptions = GA4_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/80 truncate">{meta.label}</p>
          <p className="text-[10px] text-white/30 truncate">{meta.description}</p>
        </div>
        <button
          onClick={() => selectWidget(null)}
          className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-white/40" />
        </button>
      </div>

      {/* Config fields */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Title */}
        <TextField
          label="Title"
          value={widget.title}
          onChange={(v) => updateWidget(widget.id, { title: v })}
          placeholder="Widget title"
        />

        {/* Text content (text widget only) */}
        {widget.type === 'text' && (
          <div>
            <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">
              Content
            </label>
            <textarea
              value={widget.content || ''}
              onChange={(e) => updateWidget(widget.id, { content: e.target.value })}
              placeholder="Enter text content..."
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[var(--db-primary)]/50 placeholder:text-white/20 transition-colors resize-none h-20"
            />
          </div>
        )}

        {/* Data source */}
        {!isStatic && (
          <SelectField
            label="Data Source"
            value={widget.dataSource}
            options={[
              { value: 'ga4', label: 'Google Analytics' },
              { value: 'gsc', label: 'Search Console' },
            ]}
            onChange={(v) => updateWidget(widget.id, { dataSource: v as DataSource })}
          />
        )}

        {/* Metric */}
        {!isStatic && widget.type !== 'table' && widget.type !== 'keywords-table' && (
          <SelectField
            label="Metric"
            value={widget.metric || ''}
            options={metricOptions}
            onChange={(v) => updateWidget(widget.id, { metric: v })}
          />
        )}

        {/* Dimension */}
        {!isStatic && widget.type !== 'kpi' && widget.type !== 'seo-performance' && (
          <SelectField
            label="Dimension"
            value={widget.dimension || ''}
            options={dimensionOptions}
            onChange={(v) => updateWidget(widget.id, { dimension: v })}
          />
        )}

        {/* Date Range */}
        {!isStatic && (
          <SelectField
            label="Date Range"
            value={widget.dateRange || '30d'}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '14d', label: 'Last 14 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ]}
            onChange={(v) => updateWidget(widget.id, { dateRange: v as DateRange })}
          />
        )}

        {/* Chart type (charts only) */}
        {isChart && widget.type !== 'donut-chart' && widget.type !== 'seo-performance' && (
          <SelectField
            label="Chart Style"
            value={widget.chartType || 'area'}
            options={[
              { value: 'area', label: 'Area' },
              { value: 'line', label: 'Line' },
              { value: 'bar', label: 'Bar' },
            ]}
            onChange={(v) => updateWidget(widget.id, { chartType: v as ChartVariant })}
          />
        )}

        {/* Color override */}
        {!isStatic && (
          <div>
            <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={widget.colorOverride || '#10b981'}
                onChange={(e) => updateWidget(widget.id, { colorOverride: e.target.value })}
                className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={widget.colorOverride || ''}
                onChange={(e) => updateWidget(widget.id, { colorOverride: e.target.value })}
                placeholder="Default"
                className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[var(--db-primary)]/50 placeholder:text-white/20"
              />
            </div>
          </div>
        )}

        {/* Show comparison (KPI only) */}
        {widget.type === 'kpi' && (
          <ToggleField
            label="Show Comparison"
            value={widget.showComparison ?? true}
            onChange={(v) => updateWidget(widget.id, { showComparison: v })}
          />
        )}
      </div>

      {/* Footer with delete */}
      <div className="px-3 py-2.5 border-t border-white/[0.06]">
        <button
          onClick={() => {
            removeWidget(widget.id);
            selectWidget(null);
          }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-red-400/80 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Remove Widget
        </button>
      </div>
    </div>
  );
}
