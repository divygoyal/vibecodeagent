'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { Globe, PenTool, Search, Users, Bug } from 'lucide-react';

export type WorkspaceTab = 'analysis' | 'content' | 'keywords' | 'competitor' | 'crawler';

interface WorkspaceTabsProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

const TABS: { id: WorkspaceTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'analysis', label: 'Domain Analysis', icon: Globe, description: 'Full SEO audit' },
  { id: 'content', label: 'Content Editor', icon: PenTool, description: 'Write & score' },
  { id: 'keywords', label: 'Keyword Research', icon: Search, description: 'Find opportunities' },
  { id: 'competitor', label: 'Competitor Spy', icon: Users, description: 'Compare domains' },
  { id: 'crawler', label: 'Site Crawler', icon: Bug, description: 'Multi-page audit' },
];

export function WorkspaceTabs({ activeTab, onTabChange }: WorkspaceTabsProps) {
  return (
    <div className="glass-card rounded-2xl p-2 mb-6">
      <div className="flex overflow-x-auto scrollbar-hide gap-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors relative whitespace-nowrap shrink-0 ${
                isActive
                  ? 'text-emerald-400'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : ''}`} />
              <div className="flex flex-col items-start">
                <span className={`text-sm font-medium ${isActive ? 'text-emerald-400' : ''}`}>
                  {tab.label}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] hidden md:block leading-tight">
                  {tab.description}
                </span>
              </div>
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
