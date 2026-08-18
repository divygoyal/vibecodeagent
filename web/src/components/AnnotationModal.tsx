'use client';

import { useState, useEffect } from 'react';
import { X, Megaphone, Wrench, Package, Bot, StickyNote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    type ChartAnnotation,
    type AnnotationCategory,
    ANNOTATION_CATEGORIES,
    getCategoryColor,
    useAnnotationStore,
} from '@/stores/annotationStore';

const CATEGORY_ICONS: Record<AnnotationCategory, typeof Megaphone> = {
    marketing: Megaphone,
    technical: Wrench,
    product: Package,
    algorithm_update: Bot,
    custom: StickyNote,
};

interface AnnotationModalProps {
    open: boolean;
    onClose: () => void;
    /** Pre-fill with an existing annotation for editing */
    annotation?: ChartAnnotation | null;
    /** Pre-fill the date (e.g. from clicking a chart date) */
    defaultDate?: string;
    /** GA4 property ID to scope the annotation to */
    propertyId?: string;
}

export default function AnnotationModal({
    open,
    onClose,
    annotation,
    defaultDate,
    propertyId,
}: AnnotationModalProps) {
    const { createAnnotation, updateAnnotation } = useAnnotationStore();
    const isEdit = !!annotation;

    const [date, setDate] = useState(annotation?.date || defaultDate || '');
    const [category, setCategory] = useState<AnnotationCategory>(annotation?.category || 'custom');
    const [title, setTitle] = useState(annotation?.title || '');
    const [description, setDescription] = useState(annotation?.description || '');
    const [url, setUrl] = useState(annotation?.url || '');
    const [color, setColor] = useState(annotation?.color || '');
    const [saving, setSaving] = useState(false);

    // Reset form when modal opens with new data
    useEffect(() => {
        if (open) {
            setDate(annotation?.date || defaultDate || '');
            setCategory(annotation?.category || 'custom');
            setTitle(annotation?.title || '');
            setDescription(annotation?.description || '');
            setUrl(annotation?.url || '');
            setColor(annotation?.color || '');
        }
    }, [open, annotation, defaultDate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !title.trim()) return;

        setSaving(true);
        try {
            if (isEdit && annotation) {
                await updateAnnotation(annotation.id, {
                    date,
                    category,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    url: url.trim() || undefined,
                    color: color || undefined,
                    property_id: propertyId || undefined,
                });
            } else {
                await createAnnotation({
                    date,
                    category,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    url: url.trim() || undefined,
                    color: color || undefined,
                    property_id: propertyId || undefined,
                });
            }
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const activeCategoryColor = color || getCategoryColor(category);

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-[#0c0c12] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                                <h3 className="text-sm font-semibold text-white">
                                    {isEdit ? 'Edit Annotation' : 'Add Annotation'}
                                </h3>
                                <button
                                    onClick={onClose}
                                    className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                                {/* Date */}
                                <div>
                                    <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none transition [color-scheme:dark]"
                                    />
                                </div>

                                {/* Category pills */}
                                <div>
                                    <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Category</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {ANNOTATION_CATEGORIES.map(cat => {
                                            const Icon = CATEGORY_ICONS[cat.key];
                                            const isActive = category === cat.key;
                                            return (
                                                <button
                                                    key={cat.key}
                                                    type="button"
                                                    onClick={() => { setCategory(cat.key); setColor(''); }}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border transition font-medium ${
                                                        isActive
                                                            ? 'border-white/[0.15] bg-white/[0.06] text-white'
                                                            : 'border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08]'
                                                    }`}
                                                >
                                                    <Icon
                                                        className="w-3 h-3"
                                                        style={{ color: isActive ? cat.color : undefined }}
                                                    />
                                                    {cat.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Title */}
                                <div>
                                    <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Title</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        required
                                        maxLength={200}
                                        placeholder="e.g. Launched new pricing page"
                                        className="w-full px-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none transition"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                                        Description <span className="text-zinc-700">(optional)</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        maxLength={2000}
                                        rows={2}
                                        placeholder="Additional context..."
                                        className="w-full px-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none transition resize-none"
                                    />
                                </div>

                                {/* URL */}
                                <div>
                                    <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                                        Link <span className="text-zinc-700">(optional)</span>
                                    </label>
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full px-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none transition"
                                    />
                                </div>

                                {/* Preview */}
                                <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: activeCategoryColor }}
                                    />
                                    <span className="text-[11px] text-zinc-400">
                                        Preview: marker will appear as a {ANNOTATION_CATEGORIES.find(c => c.key === category)?.label || 'Custom'} annotation on {date || 'selected date'}
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg border border-white/[0.06] transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving || !date || !title.trim()}
                                        className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{
                                            backgroundColor: activeCategoryColor + '20',
                                            borderWidth: 1,
                                            borderColor: activeCategoryColor + '40',
                                        }}
                                    >
                                        {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Annotation'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
