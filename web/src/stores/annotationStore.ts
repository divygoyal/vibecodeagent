import { create } from 'zustand';

// ─── Types ───
export type AnnotationCategory = 'marketing' | 'technical' | 'product' | 'algorithm_update' | 'custom';

export interface ChartAnnotation {
    id: number;
    date: string;          // YYYY-MM-DD
    category: AnnotationCategory;
    title: string;
    description?: string;
    color?: string;
    url?: string;
    source: string;        // manual | auto
    property_id?: string;
    created_at?: string;
    updated_at?: string;
}

export const ANNOTATION_CATEGORIES: { key: AnnotationCategory; label: string; color: string; icon: string }[] = [
    { key: 'marketing',        label: 'Marketing',        color: '#34d399', icon: 'Megaphone' },
    { key: 'technical',        label: 'Technical',        color: '#22d3ee', icon: 'Wrench' },
    { key: 'product',          label: 'Product',          color: '#a78bfa', icon: 'Package' },
    { key: 'algorithm_update', label: 'Algorithm Update', color: '#f472b6', icon: 'Bot' },
    { key: 'custom',           label: 'Custom',           color: '#fbbf24', icon: 'StickyNote' },
];

export function getCategoryColor(category: AnnotationCategory): string {
    return ANNOTATION_CATEGORIES.find(c => c.key === category)?.color || '#fbbf24';
}

// ─── Store ───
interface AnnotationState {
    annotations: ChartAnnotation[];
    isLoading: boolean;
    error: string | null;
    showAnnotations: boolean;

    // Actions
    fetchAnnotations: (propertyId?: string, startDate?: string, endDate?: string) => Promise<void>;
    createAnnotation: (data: Omit<ChartAnnotation, 'id' | 'source' | 'created_at' | 'updated_at'>) => Promise<ChartAnnotation | null>;
    updateAnnotation: (id: number, data: Partial<ChartAnnotation>) => Promise<boolean>;
    deleteAnnotation: (id: number) => Promise<boolean>;
    toggleAnnotations: () => void;
    setShowAnnotations: (show: boolean) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
    annotations: [],
    isLoading: false,
    error: null,
    showAnnotations: true,

    fetchAnnotations: async (propertyId, startDate, endDate) => {
        set({ isLoading: true, error: null });
        try {
            const params = new URLSearchParams();
            if (propertyId) params.set('propertyId', propertyId);
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);

            const res = await fetch(`/api/annotations?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch annotations');

            const data: ChartAnnotation[] = await res.json();
            set({ annotations: data, isLoading: false });
        } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    createAnnotation: async (data) => {
        try {
            const res = await fetch('/api/annotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create annotation');
            }
            const created: ChartAnnotation = await res.json();
            set(state => ({ annotations: [created, ...state.annotations] }));
            return created;
        } catch (err) {
            set({ error: (err as Error).message });
            return null;
        }
    },

    updateAnnotation: async (id, data) => {
        try {
            const res = await fetch(`/api/annotations?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update annotation');
            const updated: ChartAnnotation = await res.json();
            set(state => ({
                annotations: state.annotations.map(a => a.id === id ? { ...a, ...updated } : a),
            }));
            return true;
        } catch (err) {
            set({ error: (err as Error).message });
            return false;
        }
    },

    deleteAnnotation: async (id) => {
        try {
            const res = await fetch(`/api/annotations?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete annotation');
            set(state => ({
                annotations: state.annotations.filter(a => a.id !== id),
            }));
            return true;
        } catch (err) {
            set({ error: (err as Error).message });
            return false;
        }
    },

    toggleAnnotations: () => set(state => ({ showAnnotations: !state.showAnnotations })),
    setShowAnnotations: (show) => set({ showAnnotations: show }),
}));
