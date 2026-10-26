/**
 * Builder v2 editor state (BUILDER.md 11.5): the document, undo/redo over immutable snapshots
 * (references, not deep clones), selection, page, preview mode and save status.
 *
 * Every change goes through apply(), so undo covers drags, resizes, config edits, pages, theme
 * and controls. Coalescing: changes with the same coalesce key within 600 ms (typing in a
 * field) become one history entry; a drag or resize is committed once, on drop.
 */
import { create } from 'zustand';
import { defaultControlState } from '@/lib/builder/publicDoc';
import type { ControlState, DashboardDocV2, DashboardRecord, ShareState } from '@/lib/builder/types';

const MAX_HISTORY = 100;
const COALESCE_MS = 600;

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export type Viewport = 'desktop' | 'tablet' | 'phone';

interface EditorState {
    id: string | null;
    rev: number;
    doc: DashboardDocV2 | null;
    share: ShareState | null;
    views: number;
    past: DashboardDocV2[];
    future: DashboardDocV2[];
    lastKey: string | null;
    lastAt: number;
    selectedId: string | null;
    selectedControlId: string | null;
    pageId: string | null;
    preview: boolean;
    viewport: Viewport;
    controls: ControlState | null;
    status: SaveStatus;
    /** Doc version that is on the server (to know what autosave still has to send). */
    savedDoc: DashboardDocV2 | null;
    announce: string;

    load: (rec: DashboardRecord) => void;
    apply: (fn: (doc: DashboardDocV2) => DashboardDocV2, opts?: { coalesce?: string; announce?: string }) => void;
    undo: () => void;
    redo: () => void;
    select: (id: string | null) => void;
    selectControl: (id: string | null) => void;
    setPage: (id: string) => void;
    setPreview: (v: boolean) => void;
    setViewport: (v: Viewport) => void;
    setControls: (c: ControlState) => void;
    setStatus: (s: SaveStatus) => void;
    markSaved: (rev: number, doc: DashboardDocV2) => void;
    setShare: (s: ShareState) => void;
    setAnnounce: (s: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    id: null,
    rev: 1,
    doc: null,
    share: null,
    views: 0,
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
    selectedId: null,
    selectedControlId: null,
    pageId: null,
    preview: false,
    viewport: 'desktop',
    controls: null,
    status: 'saved',
    savedDoc: null,
    announce: '',

    load: (rec) => set({
        id: rec.id,
        rev: rec.rev,
        doc: rec.doc,
        savedDoc: rec.schemaVersion === 2 ? rec.doc : null,
        share: rec.share,
        views: rec.views,
        past: [],
        future: [],
        lastKey: null,
        selectedId: null,
        selectedControlId: null,
        pageId: rec.doc.pages[0]?.id ?? null,
        controls: defaultControlState(rec.doc),
        // A migrated v1 dashboard is saved as v2 on the first edit only.
        status: 'saved',
    }),

    apply: (fn, opts) => {
        const { doc, past, lastKey, lastAt, pageId, selectedId } = get();
        if (!doc) return;
        const next = fn(doc);
        if (next === doc) return;
        const now = Date.now();
        const coalesce = opts?.coalesce && opts.coalesce === lastKey && now - lastAt < COALESCE_MS;
        const nextPage = next.pages.some((p) => p.id === pageId) ? pageId : next.pages[0]?.id ?? null;
        set({
            doc: next,
            past: coalesce ? past : [...past, doc].slice(-MAX_HISTORY),
            future: [],
            lastKey: opts?.coalesce ?? null,
            lastAt: now,
            status: 'dirty',
            pageId: nextPage,
            selectedId: selectedId && next.widgets[selectedId] ? selectedId : null,
            announce: opts?.announce ?? get().announce,
        });
    },

    undo: () => {
        const { past, doc, future, pageId } = get();
        if (!past.length || !doc) return;
        const prev = past[past.length - 1];
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, MAX_HISTORY), lastKey: null, status: 'dirty', pageId: prev.pages.some((p) => p.id === pageId) ? pageId : prev.pages[0]?.id ?? null, announce: 'Undone' });
    },

    redo: () => {
        const { past, doc, future, pageId } = get();
        if (!future.length || !doc) return;
        const next = future[0];
        set({ doc: next, past: [...past, doc].slice(-MAX_HISTORY), future: future.slice(1), lastKey: null, status: 'dirty', pageId: next.pages.some((p) => p.id === pageId) ? pageId : next.pages[0]?.id ?? null, announce: 'Redone' });
    },

    select: (id) => set({ selectedId: id, selectedControlId: null, lastKey: null }),
    selectControl: (id) => set({ selectedControlId: id, selectedId: null }),
    setPage: (id) => set({ pageId: id, selectedId: null }),
    setPreview: (v) => set({ preview: v, selectedId: v ? null : get().selectedId }),
    setViewport: (v) => set({ viewport: v }),
    setControls: (c) => set({ controls: c }),
    setStatus: (s) => set({ status: s }),
    markSaved: (rev, saved) => set({ rev, savedDoc: saved, status: get().doc === saved ? 'saved' : 'dirty' }),
    setShare: (s) => set({ share: s }),
    setAnnounce: (s) => set({ announce: s }),
}));
