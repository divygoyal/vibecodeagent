'use client'

import React from 'react'
import { Activity } from 'lucide-react'
import FixWithBotButton from '@/components/FixWithBotButton'
import type { DomainOverviewData } from './types'
import { ratingColor } from './types'

interface Props {
  data: DomainOverviewData
  domain: string
}

const metricNames: Record<string, string> = {
  LCP: 'Largest Contentful Paint',
  CLS: 'Cumulative Layout Shift',
  TBT: 'Total Blocking Time',
  FCP: 'First Contentful Paint',
  'Speed Index': 'Speed Index',
}

export function CoreWebVitals({ data, domain }: Props) {
  if (!data.pagespeed) return null

  const metrics = [
    { label: 'LCP', data: data.pagespeed.lcp },
    { label: 'CLS', data: data.pagespeed.cls },
    { label: 'TBT', data: data.pagespeed.tbt },
    { label: 'FCP', data: data.pagespeed.fcp },
    { label: 'Speed Index', data: data.pagespeed.si },
  ]

  return (
    <div className="glass-card rounded-2xl p-3 sm:p-4 md:p-6">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--card-bg)]">
          <Activity className="h-4 w-4 text-[var(--text-tertiary)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Core Web Vitals</h3>
          <p className="text-xs text-[var(--text-tertiary)]">Real-world performance metrics</p>
        </div>
      </div>

      {/* 5-column grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {metrics.map(({ label, data: metric }) => {
          const rating = ratingColor(metric.rating)
          const isPoor = metric.rating === 'POOR'
          const fullName = metricNames[label] || label

          return (
            <div
              key={label}
              className={`stat-card-hover rounded-xl p-3 sm:p-4 bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col items-center gap-2 ${
                isPoor ? 'border-red-500/30 animate-pulse' : ''
              }`}
            >
              <span className="text-[10px] sm:text-[11px] text-[var(--text-tertiary)] font-medium">
                {label}
              </span>
              <span className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                {metric.value}
                <span className="text-xs font-normal text-[var(--text-tertiary)] ml-0.5">
                  {metric.unit}
                </span>
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${rating.bg} ${rating.text}`}
              >
                {rating.label}
              </span>
              <FixWithBotButton
                label="Fix"
                size="sm"
                variant="ghost"
                context={`Fix ${fullName} which is ${metric.value}${metric.unit} (${rating.label}) for ${domain}`}
                site={domain}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CoreWebVitals
