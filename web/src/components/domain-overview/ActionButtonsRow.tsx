'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ScanSearch, PenTool, MessageSquare } from 'lucide-react'

interface ActionButtonsRowProps {
  domain: string
  auditUrl: string
}

const actions = [
  {
    title: 'Full Site Audit',
    subtitle: 'Deep-dive analysis',
    icon: ScanSearch,
    color: 'emerald',
    type: 'link' as const,
  },
  {
    title: 'Generate Content',
    subtitle: 'AI-powered blog posts',
    icon: PenTool,
    color: 'cyan',
    type: 'dispatch' as const,
    promptPrefix: 'Generate optimized content for',
  },
  {
    title: 'AI Chat',
    subtitle: 'Ask about your SEO',
    icon: MessageSquare,
    color: 'violet',
    type: 'dispatch' as const,
    promptPrefix: 'Analyze SEO for',
  },
] as const

const gradientMap: Record<string, string> = {
  emerald: 'from-emerald-500/20 to-emerald-500/5',
  cyan: 'from-cyan-500/20 to-cyan-500/5',
  violet: 'from-violet-500/20 to-violet-500/5',
}

const iconColorMap: Record<string, string> = {
  emerald: 'text-emerald-400',
  cyan: 'text-cyan-400',
  violet: 'text-violet-400',
}

const hoverBorderMap: Record<string, string> = {
  emerald: 'hover:border-emerald-500/30 hover:shadow-emerald-500/10',
  cyan: 'hover:border-cyan-500/30 hover:shadow-cyan-500/10',
  violet: 'hover:border-violet-500/30 hover:shadow-violet-500/10',
}

const hoverTextMap: Record<string, string> = {
  emerald: 'group-hover:text-emerald-300',
  cyan: 'group-hover:text-cyan-300',
  violet: 'group-hover:text-violet-300',
}

export default function ActionButtonsRow({ domain, auditUrl }: ActionButtonsRowProps) {
  const router = useRouter()

  const handleClick = (action: typeof actions[number]) => {
    if (action.type === 'link') {
      router.push(`/dashboard/audit?url=${encodeURIComponent(auditUrl)}`)
    } else {
      const question = `${action.promptPrefix} ${domain}`
      window.dispatchEvent(
        new CustomEvent('trafficclaw:ask-ai', { detail: { question } })
      )
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {actions.map((action, i) => {
        const Icon = action.icon
        return (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            onClick={() => handleClick(action)}
            className={`premium-card rounded-2xl p-5 group cursor-pointer flex items-center gap-3 transition-all hover:shadow-lg ${hoverBorderMap[action.color]}`}
          >
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradientMap[action.color]} flex items-center justify-center`}
            >
              <Icon className={`h-5 w-5 ${iconColorMap[action.color]}`} />
            </div>
            <div>
              <p
                className={`text-sm font-semibold text-zinc-200 transition-colors ${hoverTextMap[action.color]}`}
              >
                {action.title}
              </p>
              <p className="text-[11px] text-zinc-500">{action.subtitle}</p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
