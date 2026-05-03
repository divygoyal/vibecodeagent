'use client';

import type { NormalizedShareConfig, ShareDefaultInterval } from '@/lib/shareTypes';

interface Props {
  draft: NormalizedShareConfig;
  onChange: (next: NormalizedShareConfig) => void;
}

const RANGE_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const INTERVAL_OPTIONS: { value: ShareDefaultInterval; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const METRIC_OPTIONS = [
  { value: 0, label: 'Active Users' },
  { value: 1, label: 'Sessions' },
  { value: 2, label: 'Pageviews' },
  { value: 3, label: 'Pages per session' },
];

const FILTER_DIMENSIONS = [
  { value: 'country', label: 'Country' },
  { value: 'city', label: 'City' },
  { value: 'device', label: 'Device' },
  { value: 'browser', label: 'Browser' },
  { value: 'os', label: 'OS' },
  { value: 'referrer_name', label: 'Referrer' },
  { value: 'utm_source', label: 'UTM source' },
  { value: 'utm_medium', label: 'UTM medium' },
  { value: 'utm_campaign', label: 'UTM campaign' },
  { value: 'page', label: 'Page path' },
];

export default function ShareDefaultsPanel({ draft, onChange }: Props) {
  const defaults = draft.defaults;

  function setDefaults(patch: Partial<NormalizedShareConfig['defaults']>) {
    onChange({ ...draft, defaults: { ...defaults, ...patch } });
  }

  return (
    <div className="space-y-5">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-white/50">Defaults</h3>
      <p className="px-1 text-[10px] leading-relaxed text-white/40">
        First-load defaults for the public view. Visitors can still override anything from URL params or the controls bar.
      </p>

      <div className="px-1">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">Default range</p>
        <div className="grid grid-cols-4 gap-1.5">
          {RANGE_OPTIONS.map((r) => {
            const active = (defaults.range ?? '30d') === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setDefaults({ range: r.value })}
                className={`rounded-lg py-2 text-[11px] font-medium transition ${
                  active
                    ? 'bg-[var(--db-primary,#14C4E1)]/15 text-[var(--db-primary,#14C4E1)] ring-1 ring-[var(--db-primary,#14C4E1)]/40'
                    : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-1">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">Default interval</p>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
          {INTERVAL_OPTIONS.map((opt) => {
            const active = defaults.interval === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDefaults({ interval: opt.value })}
                className={`flex-1 rounded-md py-1.5 text-[10px] font-medium transition ${
                  active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-1">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">Selected KPI for main chart</p>
        <select
          value={defaults.metricIndex ?? 0}
          onChange={(e) => setDefaults({ metricIndex: Number(e.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--db-primary,#14C4E1)]/50"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m.value} value={m.value} className="bg-zinc-900">
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="px-1">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Sticky filter</p>
          {defaults.filter && (
            <button
              type="button"
              onClick={() => setDefaults({ filter: null })}
              className="text-[10px] text-white/40 hover:text-white/70"
            >
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={defaults.filter?.dimension ?? ''}
            onChange={(e) => {
              const dim = e.target.value;
              if (!dim) setDefaults({ filter: null });
              else setDefaults({ filter: { dimension: dim, value: defaults.filter?.value ?? '' } });
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--db-primary,#14C4E1)]/50"
          >
            <option value="" className="bg-zinc-900">No filter</option>
            {FILTER_DIMENSIONS.map((d) => (
              <option key={d.value} value={d.value} className="bg-zinc-900">
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={defaults.filter?.value ?? ''}
            onChange={(e) =>
              setDefaults({
                filter: defaults.filter
                  ? { ...defaults.filter, value: e.target.value }
                  : { dimension: 'country', value: e.target.value },
              })
            }
            disabled={!defaults.filter}
            placeholder="value"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none placeholder:text-white/20 focus:border-[var(--db-primary,#14C4E1)]/50 disabled:opacity-40"
          />
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-white/30">
          Pre-applies a filter when a visitor first opens the share. They can clear it from the chip in the controls bar.
        </p>
      </div>
    </div>
  );
}
