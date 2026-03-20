'use client';
import React from 'react';
import { Globe, PenTool, Search, Users, Bug } from 'lucide-react';

export type WorkspaceTab = 'analysis' | 'content' | 'keywords' | 'competitor' | 'crawler';

interface WorkspaceTabsProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

const TABS: { id: WorkspaceTab; label: string; icon: React.ElementType }[] = [
  { id: 'analysis', label: 'Domain Analysis', icon: Globe },
  { id: 'content', label: 'Content Editor', icon: PenTool },
  { id: 'keywords', label: 'Keyword Research', icon: Search },
  { id: 'competitor', label: 'Competitor Spy', icon: Users },
  { id: 'crawler', label: 'Site Crawler', icon: Bug },
];

export function WorkspaceTabs({ activeTab, onTabChange }: WorkspaceTabsProps) {
  return (
    <div className="border-b border-[var(--card-border)] mb-8">
      <div className="flex overflow-x-auto scrollbar-hide gap-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                isActive
                  ? 'text-emerald-400 border-emerald-400'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border-transparent'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
