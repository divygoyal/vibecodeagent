'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { scoreColor } from './types'

interface ScoreRingProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
  colorFn?: (score: number) => string
}

const sizeMap = { sm: 48, md: 64, lg: 80 } as const
const fontSizeMap = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' } as const

export function ScoreRing({ score, size = 'lg', label, colorFn }: ScoreRingProps) {
  const resolvedColor = (colorFn ?? scoreColor)(score)
  const px = sizeMap[size]
  const radius = (px - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  // Animated count-up
  const [displayed, setDisplayed] = useState(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const duration = 1200 // ms
    const start = performance.now()

    function tick(now: number) {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(eased * score))
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [score])

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Glow wrapper */}
      <div
        className="score-ring-glow relative"
        style={{
          filter: `drop-shadow(0 0 6px ${resolvedColor}33)`,
        }}
      >
        <svg width={px} height={px} className="-rotate-90">
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={6}
          />
          <motion.circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={resolvedColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ width: px, height: px }}
        >
          <span className={`${fontSizeMap[size]} font-bold`} style={{ color: resolvedColor }}>
            {displayed}
          </span>
        </div>
      </div>
      {label && <span className="text-xs text-zinc-500">{label}</span>}
    </div>
  )
}

export default ScoreRing
