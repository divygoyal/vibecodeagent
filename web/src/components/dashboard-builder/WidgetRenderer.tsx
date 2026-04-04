'use client';

import type { WidgetConfig } from '@/types/dashboard';
import KPIWidget from './widgets/KPIWidget';
import AreaChartWidget from './widgets/AreaChartWidget';
import BarChartWidget from './widgets/BarChartWidget';
import DonutChartWidget from './widgets/DonutChartWidget';
import TableWidget from './widgets/TableWidget';
import TextWidget from './widgets/TextWidget';
import SEOPerformanceWidget from './widgets/SEOPerformanceWidget';
import KeywordsTableWidget from './widgets/KeywordsTableWidget';

// ── Types ──

interface WidgetRendererProps {
  config: WidgetConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  isLoading?: boolean;
  isEditing?: boolean;
  onContentChange?: (content: string) => void;
  onInteraction?: (dimension: string, value: string) => void;
}

// ── Component ──

export default function WidgetRenderer({
  config,
  data,
  isLoading,
  isEditing,
  onContentChange,
  onInteraction,
}: WidgetRendererProps) {
  switch (config.type) {
    case 'kpi':
      return <KPIWidget config={config} data={data} isLoading={isLoading} onInteraction={onInteraction} />;
    case 'area-chart':
      return <AreaChartWidget config={config} data={data} isLoading={isLoading} onInteraction={onInteraction} />;
    case 'bar-chart':
      return <BarChartWidget config={config} data={data} isLoading={isLoading} onInteraction={onInteraction} />;
    case 'donut-chart':
      return <DonutChartWidget config={config} data={data} isLoading={isLoading} onInteraction={onInteraction} />;
    case 'table':
      return <TableWidget config={config} data={data} isLoading={isLoading} onInteraction={onInteraction} />;
    case 'text':
      return <TextWidget config={config} isEditing={isEditing} onContentChange={onContentChange} />;
    case 'seo-performance':
      return <SEOPerformanceWidget config={config} data={data} isLoading={isLoading} />;
    case 'keywords-table':
      return <KeywordsTableWidget config={config} data={data} isLoading={isLoading} onInteraction={onInteraction} />;
    default:
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[var(--db-text)]/40">Unknown widget type: {config.type}</p>
        </div>
      );
  }
}
