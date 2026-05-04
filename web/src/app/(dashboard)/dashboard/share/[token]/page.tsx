'use client';

import { useState, useEffect, useCallback, useRef, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Layers, Palette, Sparkles, Link2, SlidersHorizontal, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { NormalizedShareConfig, ShareData } from '@/lib/shareTypes';
import { useCredits } from '@/lib/useDashboardData';
import ShareSectionList from '@/components/share-studio/ShareSectionList';
import ShareThemePanel from '@/components/share-studio/ShareThemePanel';
import ShareBrandingPanel from '@/components/share-studio/ShareBrandingPanel';
import ShareDefaultsPanel from '@/components/share-studio/ShareDefaultsPanel';
import ShareLinkPanel from '@/components/share-studio/ShareLinkPanel';
import SharePreviewIframe from '@/components/share-studio/SharePreviewIframe';

type StudioTab = 'layout' | 'theme' | 'branding' | 'defaults' | 'links';

const TABS: { id: StudioTab; label: string; icon: typeof Layers }[] = [
  { id: 'layout', label: 'Layout', icon: Layers },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'branding', label: 'Branding', icon: Sparkles },
  { id: 'defaults', label: 'Defaults', icon: SlidersHorizontal },
  { id: 'links', label: 'Links', icon: Link2 },
];

const STUDIO_PREVIEW_MESSAGE_TYPE = 'tc-share-studio-preview';

function configsEqual(a: NormalizedShareConfig | null, b: NormalizedShareConfig | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function ShareStudioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { plan: userPlan } = useCredits();

  const [share, setShare] = useState<ShareData | null>(null);
  const [draft, setDraft] = useState<NormalizedShareConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<NormalizedShareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>('layout');
  const [showPreview, setShowPreview] = useState(true);
  const [reloadKey, setReloadKey] = useState<string>('init');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /* Push live-preview overrides to the iframe whenever the draft changes.
   * Theme accent, branding, section order/visibility update instantly without saving;
   * Save still persists everything to the backend. */
  useEffect(() => {
    if (!draft) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: STUDIO_PREVIEW_MESSAGE_TYPE,
        accentColor: draft.theme.accentColor,
        branding: {
          logoUrl: draft.branding.logoUrl,
          companyName: draft.branding.companyName,
          showWatermark: draft.branding.showWatermark,
        },
        sectionOrder: draft.sectionOrder,
        sectionVisibility: draft.sectionVisibility,
      },
      typeof window !== 'undefined' ? window.location.origin : '*',
    );
  }, [
    draft?.theme.accentColor,
    draft?.branding.logoUrl,
    draft?.branding.companyName,
    draft?.branding.showWatermark,
    draft?.sectionOrder,
    draft?.sectionVisibility,
    reloadKey,
    draft,
  ]);

  /* Load share */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/share');
        if (!res.ok) {
          if (!cancelled) setError('Failed to load shares');
          return;
        }
        const data = await res.json();
        const list: ShareData[] = data.shares ?? [];
        const found = list.find((s) => s.token === token) ?? null;
        if (!found) {
          if (!cancelled) setError('Share not found or no longer active');
          return;
        }
        if (!cancelled) {
          setShare(found);
          setDraft(found.config);
          setSavedConfig(found.config);
          setReloadKey(found.createdAt || 'init');
        }
      } catch {
        if (!cancelled) setError('Failed to load share');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isDirty = useMemo(() => !configsEqual(draft, savedConfig), [draft, savedConfig]);

  const handleSave = useCallback(async () => {
    if (!draft || !isDirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/share?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      const updated: ShareData | null = data.share ?? null;
      if (updated) {
        setShare(updated);
        setSavedConfig(updated.config);
        setDraft(updated.config);
      } else {
        setSavedConfig(draft);
      }
      setReloadKey(`${Date.now()}`);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [draft, isDirty, token]);

  const handleDiscard = useCallback(() => {
    if (!savedConfig) return;
    setDraft(savedConfig);
  }, [savedConfig]);

  /* Cmd/Ctrl+S to save */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !share || !draft) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-400">{error ?? 'Share unavailable'}</p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/share')}
          className="text-xs text-emerald-400 transition-colors hover:text-emerald-300"
        >
          Back to shared dashboards
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-zinc-950/80 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/dashboard/share')}
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">
              {draft.branding.companyName || share.siteUrl || 'Shared analytics'}
            </div>
            <div className="truncate text-[10px] text-zinc-500">{share.siteUrl}</div>
          </div>
          {isDirty && (
            <span className="ml-2 whitespace-nowrap text-[9px] font-medium text-amber-400/70">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              showPreview ? 'bg-emerald-500/10 text-emerald-400' : 'text-white/60 hover:bg-white/5'
            }`}
          >
            {showPreview ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Preview
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty}
            className="rounded-lg px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-w-0 overflow-hidden">
        {/* Vertical icon rail — keeps tab labels out of the preview's horizontal lane */}
        <div className="flex w-14 flex-col flex-shrink-0 border-r border-white/[0.06] bg-zinc-950/80 py-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                title={t.label}
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex h-12 items-center justify-center transition-colors ${
                  active
                    ? 'text-[var(--db-primary,#14C4E1)]'
                    : 'text-white/30 hover:text-white/70'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r bg-[var(--db-primary,#14C4E1)]" />
                )}
                <Icon className="h-[18px] w-[18px]" />
                <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white/80 shadow-lg group-hover:block z-50 whitespace-nowrap">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab content panel */}
        <div className="flex w-[300px] flex-shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950/60 min-w-0">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {TABS.find((t) => t.id === activeTab)?.label}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {activeTab === 'layout' && <ShareSectionList draft={draft} onChange={setDraft} />}
            {activeTab === 'theme' && <ShareThemePanel draft={draft} onChange={setDraft} />}
            {activeTab === 'branding' && (
              <ShareBrandingPanel token={token} draft={draft} onChange={setDraft} userPlan={userPlan} />
            )}
            {activeTab === 'defaults' && <ShareDefaultsPanel draft={draft} onChange={setDraft} />}
            {activeTab === 'links' && (
              <ShareLinkPanel
                token={token}
                views={share.views}
                onRevoked={() => router.push('/dashboard/share')}
              />
            )}
          </div>
        </div>

        {/* Preview pane */}
        {showPreview ? (
          <div className="hidden min-w-0 flex-1 lg:flex">
            <div className="min-w-0 flex-1">
              <SharePreviewIframe ref={iframeRef} token={token} reloadKey={reloadKey} />
            </div>
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center text-xs text-white/30 lg:flex">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 hover:bg-white/[0.05]"
            >
              Show live preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
