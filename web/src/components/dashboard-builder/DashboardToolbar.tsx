'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Save, Share2, Eye, EyeOff, Undo2, Redo2, Check, Copy, Link2, Loader2, Code2,
  FileDown,
} from 'lucide-react';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';

interface DashboardToolbarProps {
  onPreviewToggle?: () => void;
  isPreview?: boolean;
  onExportPDF?: () => Promise<void>;
}

type ShareTab = 'link' | 'embed';

export default function DashboardToolbar({ onPreviewToggle, isPreview, onExportPDF }: DashboardToolbarProps) {
  const {
    name, setName, isDirty, isSaving, save, dashboardId,
    undoStack, redoStack, undo, redo,
    isPublic, shareToken, setPublic, setShareToken,
  } = useDashboardBuilderStore();

  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [shareTab, setShareTab] = useState<ShareTab>('link');
  const [pdfExporting, setPdfExporting] = useState(false);

  const handleSave = useCallback(async () => {
    try {
      await save();
    } catch {
      // Toast would go here
    }
  }, [save]);

  const handleShare = useCallback(async () => {
    if (!dashboardId) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/share`, { method: 'POST' });
      const data = await res.json();
      if (data.shareToken) {
        setShareToken(data.shareToken);
        setPublic(true);
      }
    } catch {
      // Toast would go here
    } finally {
      setShareLoading(false);
    }
  }, [dashboardId, setShareToken, setPublic]);

  const handleRevokeShare = useCallback(async () => {
    if (!dashboardId) return;
    setShareLoading(true);
    try {
      await fetch(`/api/dashboards/${dashboardId}/share`, { method: 'DELETE' });
      setShareToken(null);
      setPublic(false);
    } catch {
      // Toast would go here
    } finally {
      setShareLoading(false);
    }
  }, [dashboardId, setShareToken, setPublic]);

  const copyShareLink = useCallback(() => {
    if (!shareToken) return;
    const url = `${window.location.origin}/view/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareToken]);

  const getEmbedCode = useCallback((type: 'iframe' | 'script') => {
    if (!shareToken) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/view/${shareToken}?embed=true`;

    if (type === 'iframe') {
      return `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px;" loading="lazy" allowtransparency="true"></iframe>`;
    }

    // Script tag approach: creates an iframe dynamically
    return `<div id="tc-dashboard-${shareToken.slice(0, 8)}"></div>\n<script>\n(function(){var d=document.getElementById("tc-dashboard-${shareToken.slice(0, 8)}");var i=document.createElement("iframe");i.src="${url}";i.style.cssText="width:100%;height:600px;border:none;border-radius:12px;";i.loading="lazy";i.allowTransparency=true;d.appendChild(i);})();\n</script>`;
  }, [shareToken]);

  const copyEmbed = useCallback((type: 'iframe' | 'script') => {
    const code = getEmbedCode(type);
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  }, [getEmbedCode]);

  const handleExportPDF = useCallback(async () => {
    if (!onExportPDF || pdfExporting) return;
    setPdfExporting(true);
    try {
      await onExportPDF();
    } finally {
      setPdfExporting(false);
    }
  }, [onExportPDF, pdfExporting]);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm">
      {/* Left: Dashboard name */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm font-semibold bg-transparent border-none outline-none text-white placeholder:text-white/30 min-w-0 flex-1 max-w-[300px]"
          placeholder="Dashboard name..."
        />
        {isDirty && (
          <span className="text-[9px] text-amber-400/60 font-medium whitespace-nowrap">Unsaved</span>
        )}
      </div>

      {/* Center: Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5 text-white/60" />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Preview toggle */}
        <button
          onClick={onPreviewToggle}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
            isPreview
              ? 'bg-[var(--db-primary)]/10 text-[var(--db-primary)]'
              : 'hover:bg-white/5 text-white/60'
          }`}
        >
          {isPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {isPreview ? 'Edit' : 'Preview'}
        </button>

        {/* PDF export */}
        {onExportPDF && (
          <button
            onClick={handleExportPDF}
            disabled={pdfExporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg hover:bg-white/5 text-white/60 transition-colors disabled:opacity-40"
            title="Download PDF"
          >
            {pdfExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            {pdfExporting ? 'Exporting...' : 'PDF'}
          </button>
        )}

        {/* Share button */}
        <div className="relative">
          <button
            onClick={() => setShowShareMenu(!showShareMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
              isPublic
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'hover:bg-white/5 text-white/60'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>

          {showShareMenu && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-full mt-1.5 w-80 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-3 z-50"
            >
              {shareToken ? (
                <div className="space-y-3">
                  {/* Tab selector: Link vs Embed */}
                  <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
                    <button
                      onClick={() => setShareTab('link')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                        shareTab === 'link' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                      }`}
                    >
                      <Link2 className="w-3 h-3" />
                      Share Link
                    </button>
                    <button
                      onClick={() => setShareTab('embed')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                        shareTab === 'embed' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      Embed Code
                    </button>
                  </div>

                  {shareTab === 'link' ? (
                    <>
                      {/* Share link section */}
                      <div className="flex items-center gap-2">
                        <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                        <p className="text-xs text-white/70">Public link is active</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/view/${shareToken}`}
                          className="flex-1 text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/60 outline-none"
                        />
                        <button
                          onClick={copyShareLink}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-white/60" />}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Embed code section */}
                      <div className="flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                        <p className="text-xs text-white/70">Embed in your website</p>
                      </div>

                      {/* iframe snippet */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-white/40 font-medium">iframe</span>
                          <button
                            onClick={() => copyEmbed('iframe')}
                            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
                          >
                            {copiedEmbed ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                            {copiedEmbed ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre className="text-[9px] leading-relaxed bg-black/30 border border-white/5 rounded-lg p-2 text-cyan-300/70 overflow-x-auto whitespace-pre-wrap break-all max-h-24">
                          {getEmbedCode('iframe')}
                        </pre>
                      </div>

                      {/* Script tag snippet */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-white/40 font-medium">Script tag</span>
                          <button
                            onClick={() => copyEmbed('script')}
                            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            Copy
                          </button>
                        </div>
                        <pre className="text-[9px] leading-relaxed bg-black/30 border border-white/5 rounded-lg p-2 text-cyan-300/70 overflow-x-auto whitespace-pre-wrap break-all max-h-24">
                          {getEmbedCode('script')}
                        </pre>
                      </div>

                      <p className="text-[9px] text-white/30">
                        Paste either snippet into your HTML. The dashboard auto-refreshes every 5 minutes.
                      </p>
                    </>
                  )}

                  {/* Revoke button (always visible) */}
                  <button
                    onClick={handleRevokeShare}
                    disabled={shareLoading}
                    className="w-full text-xs text-red-400/70 hover:text-red-400 py-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 transition-colors"
                  >
                    {shareLoading ? 'Revoking...' : 'Revoke Share Link'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-white/50">
                    Generate a public link anyone can view — or embed in your website
                  </p>
                  <button
                    onClick={handleShare}
                    disabled={shareLoading}
                    className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-[var(--db-primary)] text-white hover:bg-[var(--db-primary)]/90 transition-colors disabled:opacity-50"
                  >
                    {shareLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" />
                    )}
                    Generate Share Link
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--db-primary)] text-white hover:bg-[var(--db-primary)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
