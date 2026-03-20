'use client'

import { useState } from 'react'
import { Cpu, Shield, Globe, Check, X, ExternalLink, Copy, CheckCheck } from 'lucide-react'
import { DomainOverviewData } from './types'
import FixWithBotButton from '@/components/FixWithBotButton'

interface TechStackPanelProps {
  data: DomainOverviewData
  domain: string
}

export default function TechStackPanel({ data, domain }: TechStackPanelProps) {
  const [copiedTech, setCopiedTech] = useState<string | null>(null)

  const handleCopyTech = (tech: string) => {
    navigator.clipboard.writeText(tech)
    setCopiedTech(tech)
    setTimeout(() => setCopiedTech(null), 1500)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Technology Stack */}
      <div className="premium-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Cpu className="h-4 w-4 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Technology Stack</h3>
        </div>
        {data.technologies && data.technologies.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.technologies.map((tech) => (
              <button
                key={tech}
                onClick={() => handleCopyTech(tech)}
                title="Click to copy"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-xs font-medium text-[var(--text-secondary)] hover:border-emerald-500/30 hover:text-emerald-400 transition-colors cursor-pointer"
              >
                {tech}
                {copiedTech === tech ? (
                  <CheckCheck className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">No technologies detected</p>
        )}
      </div>

      {/* Robots.txt */}
      <div className="premium-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Shield className="h-4 w-4 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Robots.txt</h3>
        </div>
        {data.robots ? (
          <div className="space-y-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
                data.robots.found
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'bg-red-500/10 text-red-400 font-medium'
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
                <pre className="text-xs text-[var(--text-secondary)] font-mono whitespace-pre-wrap">
                  {data.robots.rules.slice(0, 5).map((rule, i) => (
                    <p key={i} className="truncate">{rule}</p>
                  ))}
                </pre>
                {data.robots.rules.length > 5 && (
                  <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                    +{data.robots.rules.length - 5} more rules
                  </p>
                )}
              </div>
            )}

            {data.robots.found && data.robots.sitemapUrls && data.robots.sitemapUrls.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                  Sitemaps
                </p>
                {data.robots.sitemapUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-[11px] text-cyan-400 hover:text-cyan-300 truncate transition-colors"
                  >
                    <span className="truncate">{url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
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
          <p className="text-xs text-[var(--text-secondary)]">No robots.txt data</p>
        )}
      </div>

      {/* Sitemap */}
      <div className="premium-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
            <Globe className="h-4 w-4 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sitemap</h3>
        </div>
        {data.sitemap ? (
          <div className="space-y-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
                data.sitemap.found
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'bg-red-500/10 text-red-400 font-medium'
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
              <a
                href={`https://${domain}/sitemap.xml`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg bg-white/[0.02] border border-white/[0.03] hover:border-emerald-500/30 p-3 text-center transition-colors group"
              >
                <p className="text-3xl font-bold text-[var(--text-primary)]">
                  {data.sitemap.urlCount.toLocaleString()}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 flex items-center justify-center gap-1">
                  URLs indexed
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </a>
            )}

            {!data.sitemap.found && (
              <FixWithBotButton
                label="Create"
                context={`Help me create a sitemap.xml for ${domain}`}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">No sitemap data</p>
        )}
      </div>
    </div>
  )
}
