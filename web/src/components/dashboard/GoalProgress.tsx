'use client';

interface GoalItem {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}

interface GoalProgressProps {
  goals: GoalItem[];
}

function progressPercent(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function fmtCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

/**
 * Goal Progress Tracker — horizontal progress bars showing progress toward
 * user-defined or implicit goals. Color-coded by completion status.
 */
export default function GoalProgress({ goals }: GoalProgressProps) {
  if (goals.length === 0) {
    return (
      <div className="border border-white/[0.08] bg-[#020508] p-6">
        <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
          Goal Progress
        </div>
        <div className="mt-4 border border-white/[0.06] bg-[#060b0f] px-4 py-5">
          <div className="text-sm text-zinc-400">Set up conversion goals in your analytics property to track progress here.</div>
          <a href="https://support.google.com/analytics/answer/12844695" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-[12px] font-medium text-emerald-400 hover:text-emerald-300">
            Learn about GA4 goals
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.08] bg-[#020508] p-6">
      <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
        Goal Progress
      </div>
      <div className="mt-4 space-y-4">
        {goals.map((goal) => {
          const pct = progressPercent(goal.current, goal.target);
          const statusColor = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-zinc-400';

          return (
            <div key={goal.label} className="group/gl rounded px-2 py-1.5 -mx-2 transition-all duration-200 hover:bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-200">{goal.label}</span>
                <span className={`font-mono text-[12px] font-medium ${statusColor}`}>
                  {fmtCompact(goal.current)}{goal.unit ? ` ${goal.unit}` : ''} / {fmtCompact(goal.target)}{goal.unit ? ` ${goal.unit}` : ''}
                </span>
              </div>
              <div className="mt-1.5 h-2 bg-[#0a0f14] transition-shadow duration-200 group-hover/gl:shadow-[0_0_8px_rgba(52,211,153,0.08)]">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: goal.color || (pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#71717a'),
                  }}
                />
              </div>
              <div className="mt-1 text-[10px] text-zinc-600">{pct}% complete</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
