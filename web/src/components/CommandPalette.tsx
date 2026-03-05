'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, LayoutDashboard, Bot, BarChart3, MessageSquare,
  ScanSearch, Settings, Book, Newspaper, Command, ArrowRight,
  Moon, Sparkles
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  section: string;
  keywords?: string[];
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const navigate = useCallback((path: string) => {
    router.push(path);
    setOpen(false);
  }, [router]);

  const commands = useMemo<CommandItem[]>(() => [
    { id: 'overview', label: 'Overview', description: 'Dashboard overview', icon: LayoutDashboard, action: () => navigate('/dashboard'), section: 'Navigation', keywords: ['home', 'dashboard'] },
    { id: 'ai-chat', label: 'AI Chat', description: 'Talk to AI analyst', icon: MessageSquare, action: () => navigate('/dashboard/ai-chat'), section: 'Navigation', keywords: ['chat', 'ai', 'ask'] },
    { id: 'analytics', label: 'Analytics', description: 'Traffic & sources', icon: BarChart3, action: () => navigate('/dashboard/analytics'), section: 'Navigation', keywords: ['traffic', 'visitors', 'ga4'] },
    { id: 'seo', label: 'SEO', description: 'Keywords & rankings', icon: Search, action: () => navigate('/dashboard/seo'), section: 'Navigation', keywords: ['search', 'keywords', 'gsc', 'rankings'] },
    { id: 'audit', label: 'Site Audit', description: '50+ SEO checks', icon: ScanSearch, action: () => navigate('/dashboard/audit'), section: 'Navigation', keywords: ['audit', 'check', 'health'] },
    { id: 'bot', label: 'Bot Setup', description: 'Configure Telegram bot', icon: Bot, action: () => navigate('/dashboard/bot'), section: 'Navigation', keywords: ['telegram', 'bot', 'setup'] },
    { id: 'settings', label: 'Settings', description: 'Account settings', icon: Settings, action: () => navigate('/dashboard/settings'), section: 'Navigation', keywords: ['account', 'profile', 'preferences'] },
    { id: 'docs', label: 'Docs', description: 'Documentation', icon: Book, action: () => navigate('/dashboard/docs'), section: 'Resources', keywords: ['help', 'documentation', 'guide'] },
    { id: 'blog', label: 'Blog', description: 'Latest updates', icon: Newspaper, action: () => navigate('/dashboard/blog'), section: 'Resources', keywords: ['news', 'updates', 'articles'] },
    { id: 'theme-toggle', label: 'Toggle Theme', description: 'Switch dark/light mode', icon: Moon, action: () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('gc-theme', next);
      setOpen(false);
    }, section: 'Actions', keywords: ['dark', 'light', 'theme', 'mode'] },
    { id: 'ask-ai', label: 'Ask AI: What should I do today?', description: 'Get AI recommendation', icon: Sparkles, action: () => {
      window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', {
        detail: { question: 'What is the ONE thing I should do today to grow?' }
      }));
      setOpen(false);
    }, section: 'Actions', keywords: ['ai', 'recommend', 'grow', 'action'] },
  ], [navigate]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.keywords?.some(k => k.includes(q))
    );
  }, [query, commands]);

  // Group by section
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filtered.forEach(c => {
      if (!groups[c.section]) groups[c.section] = [];
      groups[c.section].push(c);
    });
    return groups;
  }, [filtered]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Arrow key navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selectedIndex]?.action();
    }
  }, [filtered, selectedIndex]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className="relative w-full max-w-lg bg-[#0a0a0f] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] text-zinc-500 font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-2" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-zinc-500">No results found</p>
              <p className="text-xs text-zinc-600 mt-1">Try a different search term</p>
            </div>
          ) : (
            Object.entries(grouped).map(([section, items]) => (
              <div key={section}>
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{section}</span>
                </div>
                {items.map(item => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={item.action}
                      role="option"
                      aria-selected={idx === selectedIndex}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        idx === selectedIndex
                          ? 'bg-emerald-500/[0.08] text-white'
                          : 'text-zinc-400 hover:bg-white/[0.03] hover:text-white'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${idx === selectedIndex ? 'text-emerald-400' : 'text-zinc-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.label}</div>
                        {item.description && (
                          <div className="text-[11px] text-zinc-500 truncate">{item.description}</div>
                        )}
                      </div>
                      {idx === selectedIndex && <ArrowRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white/[0.04] rounded border border-white/[0.06] font-mono">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white/[0.04] rounded border border-white/[0.06] font-mono">↵</kbd> Select</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Command className="w-3 h-3" />
            <span>K to toggle</span>
          </div>
        </div>
      </div>
    </div>
  );
}
