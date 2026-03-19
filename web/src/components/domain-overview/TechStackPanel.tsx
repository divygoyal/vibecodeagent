'use client'

import { Cpu, Shield, Globe, Check, X } from 'lucide-react'
import { DomainOverviewData } from './types'
import FixWithBotButton from '@/components/FixWithBotButton'

interface TechStackPanelProps {
  data: DomainOverviewData
  domain: string
}

export default function TechStackPanel({ data, domain }: TechStackPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Technology Stack */}
      <div className="premium-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Cpu className="h-4 w-4 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">Technology Stack</h3>
        </div>
        {data.technologies && data.technologies.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.technologies.map((tech) => (
              <span
                key={tech}
                className="px-2.5 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--text-secondary)] hover:border-emerald-500/30 hover:text-emerald-400 transition-colors cursor-default"
              >
                {tech}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No technologies detected</p>
        )}
      </div>

      {/* Robots.txt */}
      <div className="premium-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Shield className="h-4 w-4 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">Robots.txt</h3>
        </div>
        {data.robots ? (
          <div className="space-y-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                data.robots.found
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {data.robots.found ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
              {data.robots.found ? 'Found' : 'Not Found'}
            </span>

            {data.robots.found && data.robots.rules.length > 0 && (
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-2.5">
                <pre className="font-mono text-[11px] text-zinc-400 whitespace-pre-wrap">
                  {data.robots.rules.slice(0, 5).map((rule, i) => (
                    <p key={i} className="truncate">{rule}</p>
                  ))}
                </pre>
                {data.robots.rules.length > 5 && (
                  <p className="text-[10px] text-zinc-600 mt-1">
                    +{data.robots.rules.length - 5} more rules
                  </p>
                )}
              </div>
            )}

            {data.robots.found && data.robots.sitemapUrls && data.robots.sitemapUrls.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Sitemaps
                </p>
                {data.robots.sitemapUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-[11px] text-cyan-400 hover:text-cyan-300 truncate transition-colors"
                  >
                    {url}
                  </a>
                ))}
              </div>
            )}

            {!data.robots.found && (
              <FixWithBotButton
                label="Create"
                context={`Help me create a robots.txt for ${domain}`}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No robots.txt data</p>
        )}
      </div>

      {/* Sitemap */}
      <div className="premium-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Globe className="h-4 w-4 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">Sitemap</h3>
        </div>
        {data.sitemap ? (
          <div className="space-y-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                data.sitemap.found
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {data.sitemap.found ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
              {data.sitemap.found ? 'Found' : 'Not Found'}
            </span>

            {data.sitemap.found && (
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3 text-center">
                <p className="text-2xl font-bold text-zinc-200">
                  {data.sitemap.urlCount.toLocaleString()}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">URLs indexed</p>
              </div>
            )}

            {!data.sitemap.found && (
              <FixWithBotButton
                label="Create"
                context={`Help me create a sitemap.xml for ${domain}`}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No sitemap data</p>
        )}
      </div>
    </div>
  )
}
