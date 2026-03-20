'use client'

import { useState, Fragment } from 'react'
import { motion } from 'framer-motion'
import {
  Target,
  ChevronDown,
  ChevronUp,
  PenTool,
  MessageSquare,
  Copy,
} from 'lucide-react'
import { DomainOverviewData, difficultyBadge, intentColor } from './types'
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu'

interface KeywordTableProps {
  data: DomainOverviewData
  domain: string
}

export default function KeywordTable({ data, domain }: KeywordTableProps) {
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)
  const { generateContent, trackKeyword, analyzeWithAI, copyToClipboard } = useTableActions()

  if (!data.keywords || data.keywords.length === 0) return null

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Keyword Opportunities</h3>
      </div>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {['Keyword', 'Volume', 'Difficulty', 'Intent', 'Content Type', ''].map((h) => (
                <th
                  key={h || 'actions'}
                  className="px-6 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.keywords.map((kw) => {
              const db = difficultyBadge(kw.difficulty)
              const expanded = expandedKeyword === kw.keyword
              return (
                <Fragment key={kw.keyword}>
                  <tr
                    onClick={() => setExpandedKeyword(expanded ? null : kw.keyword)}
                    className="table-row-premium border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {expanded ? (
                          <ChevronUp className="h-3 w-3 text-zinc-500 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
                        )}
                        <span className="text-xs text-zinc-300">{kw.keyword}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-xs text-zinc-400">
                      {kw.volume.toLocaleString()}
                    </td>
                    <td className={`px-6 py-3 text-xs font-medium ${db.text}`}>
                      {kw.difficulty}
                    </td>
                    <td className={`px-6 py-3 text-xs font-medium ${intentColor(kw.intent)}`}>
                      {kw.intent}
                    </td>
                    <td className="px-6 py-3 text-xs text-zinc-400">{kw.contentType}</td>
                    <td className="px-6 py-3">
                      <TableActionMenu
                        actions={[
                          {
                            label: 'Generate Content',
                            icon: PenTool,
                            onClick: () => generateContent(kw.keyword).onClick(),
                          },
                          {
                            label: 'Track Keyword',
                            icon: Target,
                            onClick: () => trackKeyword(kw.keyword).onClick(),
                          },
                          {
                            label: 'Analyze with AI',
                            icon: MessageSquare,
                            onClick: () =>
                              analyzeWithAI(
                                `Analyze keyword opportunity: "${kw.keyword}" (volume: ${kw.volume}, difficulty: ${kw.difficulty}, intent: ${kw.intent}) for ${domain}`
                              ).onClick(),
                          },
                          {
                            label: 'Copy',
                            icon: Copy,
                            onClick: () => copyToClipboard(kw.keyword).onClick(),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-white/[0.03]">
                      <td colSpan={6} className="px-6 py-3">
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          transition={{ duration: 0.2 }}
                          className="pl-7"
                        >
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">
                            Why this keyword?
                          </p>
                          <p className="text-xs text-zinc-500">{kw.reason}</p>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
