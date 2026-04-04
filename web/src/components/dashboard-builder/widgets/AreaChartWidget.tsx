'use client';

import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { WidgetConfig } from '@/types/dashboard';

interface AreaChartWidgetProps {
  config: WidgetConfig;
  data?: Array<Record<string, unknown>>;
  isLoading?: boolean;
}

const COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function AreaChartWidget({ config, data, isLoading }: AreaChartWidgetProps) {
  const { dataKey, dimensionKey, chartData } = useMemo(() => {
    const dk = config.metric || 'totalUsers';
    const dimK = config.dimension || 'date';
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
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`area-grad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorOverride} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colorOverride} stopOpacity={0} />
              </linearGradient>
            </defs>
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
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={colorOverride}
              fill={`url(#area-grad-${config.id})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
