'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { WidgetConfig } from '@/types/dashboard';

interface BarChartWidgetProps {
  config: WidgetConfig;
  data?: Array<Record<string, unknown>>;
  isLoading?: boolean;
  onInteraction?: (dimension: string, value: string) => void;
}

export default function BarChartWidget({ config, data, isLoading, onInteraction }: BarChartWidgetProps) {
  const { dataKey, dimensionKey, chartData } = useMemo(() => {
    const dk = config.metric || 'sessions';
    const dimK = config.dimension || 'source';
    return { dataKey: dk, dimensionKey: dimK, chartData: data || [] };
  }, [config, data]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center animate-pulse">
        <div className="w-[90%] h-[70%] bg-white/5 rounded-lg" />
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

  const colorOverride = config.colorOverride || 'var(--db-primary)';

  return (
    <div className="h-full flex flex-col px-3 py-2">
      <p className="text-xs font-medium text-[var(--db-text)]/60 mb-2 truncate">
        {config.title}
      </p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey={dimensionKey}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#050508',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.75rem',
                fontSize: '11px',
              }}
              labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: 'rgba(255,255,255,0.7)' }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar
              dataKey={dataKey}
              fill={colorOverride}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              cursor={onInteraction ? 'pointer' : undefined}
              onClick={(entry) => {
                const rec = entry as unknown as Record<string, unknown>;
                if (onInteraction && rec?.[dimensionKey] != null) {
                  onInteraction(dimensionKey, String(rec[dimensionKey]));
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
