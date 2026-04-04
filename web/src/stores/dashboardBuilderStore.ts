// Dashboard Builder Zustand Store
// Manages editor state: widgets, layouts, theme, undo/redo, persistence

import { create } from 'zustand';
import type {
  WidgetConfig,
  WidgetType,
  GridLayouts,
  DashboardTheme,
  DashboardLayout,
  DashboardSnapshot,
  UpdateDashboardRequest,
  DateRange,
  LayoutItem,
} from '@/types/dashboard';
import {
  createWidget,
  getWidgetConstraints,
  THEME_PRESETS,
} from '@/lib/dashboardBuilder';

// ── Types ────────────────────────────────────────────────────

interface DashboardBuilderState {
  // Current dashboard
  dashboardId: string | null;
  name: string;
  description: string;
  propertyId: string;
  siteUrl: string;
  widgets: WidgetConfig[];
  gridLayouts: GridLayouts;
  theme: DashboardTheme;
  isPublic: boolean;
  shareToken: string | null;
  dateRange: DateRange;

  // Editor state
  selectedWidgetId: string | null;
  isEditing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
  undoStack: DashboardSnapshot[];
  redoStack: DashboardSnapshot[];

  // Actions — Dashboard
  loadDashboard: (dashboard: DashboardLayout) => void;
  resetEditor: () => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setDateRange: (range: DateRange) => void;

  // Actions — Widgets
  addWidget: (type: WidgetType) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<WidgetConfig>) => void;
  duplicateWidget: (widgetId: string) => void;
  selectWidget: (widgetId: string | null) => void;

  // Actions — Layout
  updateLayouts: (layouts: GridLayouts) => void;
  onLayoutChange: (layout: LayoutItem[], allLayouts: GridLayouts) => void;

  // Actions — Theme
  updateTheme: (updates: Partial<DashboardTheme>) => void;
  applyPreset: (preset: DashboardTheme['preset']) => void;

  // Actions — Persistence
  save: () => Promise<void>;
  markClean: () => void;

  // Actions — Sharing
  setPublic: (isPublic: boolean) => void;
  setShareToken: (token: string | null) => void;

  // Actions — Undo / Redo
  undo: () => void;
  redo: () => void;
  pushSnapshot: () => void;
}

// ── Defaults ─────────────────────────────────────────────────

const MAX_UNDO = 50;

const initialState = {
  dashboardId: null as string | null,
  name: 'Untitled Dashboard',
  description: '',
  propertyId: '',
  siteUrl: '',
  widgets: [] as WidgetConfig[],
  gridLayouts: { lg: [], md: [], sm: [] } as GridLayouts,
  theme: { ...THEME_PRESETS.default } as DashboardTheme,
  isPublic: false,
  shareToken: null as string | null,
  dateRange: '30d' as DateRange,

  selectedWidgetId: null as string | null,
  isEditing: true,
  isDirty: false,
  isSaving: false,
  lastSaved: null as string | null,
  undoStack: [] as DashboardSnapshot[],
  redoStack: [] as DashboardSnapshot[],
};

// ── Store ────────────────────────────────────────────────────

export const useDashboardBuilderStore = create<DashboardBuilderState>((set, get) => ({
  ...initialState,

  // ─── Dashboard ───────────────────────────────────────────

  loadDashboard: (dashboard) => {
    set({
      dashboardId: dashboard.id,
      name: dashboard.name,
      description: dashboard.description ?? '',
      propertyId: dashboard.propertyId,
      siteUrl: dashboard.siteUrl ?? '',
      widgets: dashboard.widgets,
      gridLayouts: dashboard.gridLayouts,
      theme: dashboard.theme,
      isPublic: dashboard.isPublic,
      shareToken: dashboard.shareToken ?? null,
      isDirty: false,
      selectedWidgetId: null,
      undoStack: [],
      redoStack: [],
      lastSaved: dashboard.updatedAt,
    });
  },

  resetEditor: () => set({ ...initialState }),

  setName: (name) => set({ name, isDirty: true }),

  setDescription: (description) => set({ description, isDirty: true }),

  setDateRange: (dateRange) => set({ dateRange }),

  // ─── Widgets ─────────────────────────────────────────────

  addWidget: (type) => {
    const state = get();
    state.pushSnapshot();

    const widget = createWidget(type);
    const constraints = getWidgetConstraints(type);
    const meta = (
      // inline import to avoid circular
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/lib/dashboardBuilder') as typeof import('@/lib/dashboardBuilder')
    ).WIDGET_REGISTRY[type];

    // Find lowest y position to place at bottom
    const maxY = state.gridLayouts.lg.reduce((max, l) => Math.max(max, l.y + l.h), 0);

    const newLayout: LayoutItem = {
      i: widget.id,
      x: 0,
      y: maxY,
      w: meta.defaultSize.w,
      h: meta.defaultSize.h,
      ...constraints,
    };

    set({
      widgets: [...state.widgets, widget],
      gridLayouts: {
        lg: [...state.gridLayouts.lg, newLayout],
        md: [...state.gridLayouts.md, { ...newLayout, w: Math.min(newLayout.w, 6) }],
        sm: [...state.gridLayouts.sm, { ...newLayout, w: 12, x: 0 }],
      },
      selectedWidgetId: widget.id,
      isDirty: true,
      redoStack: [],
    });
  },

  removeWidget: (widgetId) => {
    const state = get();
    state.pushSnapshot();

    set({
      widgets: state.widgets.filter((w) => w.id !== widgetId),
      gridLayouts: {
        lg: state.gridLayouts.lg.filter((l) => l.i !== widgetId),
        md: state.gridLayouts.md.filter((l) => l.i !== widgetId),
        sm: state.gridLayouts.sm.filter((l) => l.i !== widgetId),
      },
      selectedWidgetId: state.selectedWidgetId === widgetId ? null : state.selectedWidgetId,
      isDirty: true,
      redoStack: [],
    });
  },

  updateWidget: (widgetId, updates) => {
    const state = get();
    set({
      widgets: state.widgets.map((w) => (w.id === widgetId ? { ...w, ...updates } : w)),
      isDirty: true,
    });
  },

  duplicateWidget: (widgetId) => {
    const state = get();
    const original = state.widgets.find((w) => w.id === widgetId);
    if (!original) return;

    state.pushSnapshot();

    const newWidget = createWidget(original.type, {
      ...original,
      title: `${original.title} (copy)`,
    });

    const originalLayout = state.gridLayouts.lg.find((l) => l.i === widgetId);
    const maxY = state.gridLayouts.lg.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    const constraints = getWidgetConstraints(original.type);

    const newLayout: LayoutItem = {
      i: newWidget.id,
      x: 0,
      y: maxY,
      w: originalLayout?.w ?? 4,
      h: originalLayout?.h ?? 3,
      ...constraints,
    };

    set({
      widgets: [...state.widgets, newWidget],
      gridLayouts: {
        lg: [...state.gridLayouts.lg, newLayout],
        md: [...state.gridLayouts.md, { ...newLayout, w: Math.min(newLayout.w, 6) }],
        sm: [...state.gridLayouts.sm, { ...newLayout, w: 12, x: 0 }],
      },
      selectedWidgetId: newWidget.id,
      isDirty: true,
      redoStack: [],
    });
  },

  selectWidget: (widgetId) => set({ selectedWidgetId: widgetId }),

  // ─── Layout ──────────────────────────────────────────────

  updateLayouts: (layouts) => set({ gridLayouts: layouts, isDirty: true }),

  onLayoutChange: (_layout, allLayouts) => {
    set({ gridLayouts: allLayouts, isDirty: true });
  },

  // ─── Theme ───────────────────────────────────────────────

  updateTheme: (updates) => {
    const state = get();
    set({
      theme: { ...state.theme, ...updates, preset: 'custom' as const },
      isDirty: true,
    });
  },

  applyPreset: (preset) => {
    const theme = THEME_PRESETS[preset];
    if (!theme) return;
    set({ theme: { ...theme }, isDirty: true });
  },

  // ─── Persistence ─────────────────────────────────────────

  save: async () => {
    const state = get();
    if (!state.dashboardId || state.isSaving) return;

    set({ isSaving: true });

    try {
      const body: UpdateDashboardRequest = {
        name: state.name,
        description: state.description || undefined,
        widgets: state.widgets,
        gridLayouts: state.gridLayouts,
        theme: state.theme,
        isPublic: state.isPublic,
      };

      const res = await fetch(`/api/dashboards/${state.dashboardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to save');

      set({ isDirty: false, isSaving: false, lastSaved: new Date().toISOString() });
    } catch {
      set({ isSaving: false });
      throw new Error('Failed to save dashboard');
    }
  },

  markClean: () => set({ isDirty: false }),

  // ─── Sharing ─────────────────────────────────────────────

  setPublic: (isPublic) => set({ isPublic, isDirty: true }),
  setShareToken: (token) => set({ shareToken: token }),

  // ─── Undo / Redo ─────────────────────────────────────────

  pushSnapshot: () => {
    const state = get();
    const snapshot: DashboardSnapshot = {
      widgets: JSON.parse(JSON.stringify(state.widgets)),
      gridLayouts: JSON.parse(JSON.stringify(state.gridLayouts)),
      theme: JSON.parse(JSON.stringify(state.theme)),
    };
    const stack = [...state.undoStack, snapshot];
    if (stack.length > MAX_UNDO) stack.shift();
    set({ undoStack: stack });
  },

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;

    // Save current state to redo stack
    const current: DashboardSnapshot = {
      widgets: JSON.parse(JSON.stringify(state.widgets)),
      gridLayouts: JSON.parse(JSON.stringify(state.gridLayouts)),
      theme: JSON.parse(JSON.stringify(state.theme)),
    };

    const newStack = [...state.undoStack];
    const prev = newStack.pop()!;

    set({
      widgets: prev.widgets,
      gridLayouts: prev.gridLayouts,
      theme: prev.theme,
      undoStack: newStack,
      redoStack: [...state.redoStack, current],
      isDirty: true,
      selectedWidgetId: null,
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;

    const current: DashboardSnapshot = {
      widgets: JSON.parse(JSON.stringify(state.widgets)),
      gridLayouts: JSON.parse(JSON.stringify(state.gridLayouts)),
      theme: JSON.parse(JSON.stringify(state.theme)),
    };

    const newStack = [...state.redoStack];
    const next = newStack.pop()!;

    set({
      widgets: next.widgets,
      gridLayouts: next.gridLayouts,
      theme: next.theme,
      redoStack: newStack,
      undoStack: [...state.undoStack, current],
      isDirty: true,
      selectedWidgetId: null,
    });
  },
}));
