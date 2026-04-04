'use client';

import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { WidgetConfig } from '@/types/dashboard';

interface DonutChartWidgetProps {
  config: WidgetConfig;
  data?: Array<Record<string, unknown>>;
  isLoading?: boolean;
}

const CHART_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#a855f7'];

export default function DonutChartWidget({ config, data, isLoading }: DonutChartWidgetProps) {
  const { dataKey, nameKey, chartData } = useMemo(() => {
    const dk = config.metric || 'sessions';
    const nk = config.dimension || 'channelGrouping';
    return { dataKey: dk, nameKey: nk, chartData: data || [] };
  }, [config, data]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center animate-pulse">
        <div className="w-32 h-32 rounded-full border-8 border-white/5" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-[var(--db-text)]/40">No data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-3 py-2">
      <p className="text-xs font-medium text-[var(--db-text)]/60 mb-2 truncate">
        {config.title}
      </p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="50%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey={dataKey}
              nameKey={nameKey}
              strokeWidth={0}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#050508',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.75rem',
                fontSize: '11px',
              }}
              itemStyle={{ color: 'rgba(255,255,255,0.7)' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
