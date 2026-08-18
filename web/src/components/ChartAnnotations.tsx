'use client';

import { useState } from 'react';
import { ReferenceLine } from 'recharts';
import { Megaphone, Wrench, Package, Bot, StickyNote, Plus, Trash2, Pencil, ExternalLink } from 'lucide-react';
import { type ChartAnnotation, type AnnotationCategory, getCategoryColor, ANNOTATION_CATEGORIES } from '@/stores/annotationStore';

// ─── Category Icons ───
const CATEGORY_ICONS: Record<AnnotationCategory, typeof Megaphone> = {
    marketing: Megaphone,
    technical: Wrench,
    product: Package,
    algorithm_update: Bot,
    custom: StickyNote,
};

function CategoryIcon({ category, size = 12 }: { category: AnnotationCategory; size?: number }) {
    const Icon = CATEGORY_ICONS[category] || StickyNote;
    return <Icon className="flex-shrink-0" style={{ width: size, height: size }} />;
}

// ─── Annotation Marker (rendered as Recharts customized dot on ReferenceLine) ───
interface AnnotationMarkerProps {
    annotations: ChartAnnotation[];
    date: string;
    x: number;
    y: number;
    onEdit?: (annotation: ChartAnnotation) => void;
    onDelete?: (id: number) => void;
}

function AnnotationMarker({ annotations, date, x, y, onEdit, onDelete }: AnnotationMarkerProps) {
    const [hovered, setHovered] = useState(false);
    const count = annotations.length;
    const primary = annotations[0];
    const color = primary.color || getCategoryColor(primary.category);

    return (
        <g
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ cursor: 'pointer' }}
        >
            {/* Vertical dashed line */}
            <line
                x1={x}
                y1={0}
                x2={x}
                y2={y}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={hovered ? 0.8 : 0.4}
            />
            {/* Circle marker at bottom */}
            <circle
                cx={x}
                cy={y - 2}
                r={count > 1 ? 7 : 5}
                fill={color}
                opacity={hovered ? 1 : 0.7}
                stroke="#09090b"
                strokeWidth={2}
            />
            {count > 1 && (
                <text
                    x={x}
                    y={y + 1}
                    textAnchor="middle"
                    fill="#09090b"
                    fontSize={8}
                    fontWeight={700}
                >
                    {count}
                </text>
            )}
            {/* Tooltip on hover */}
            {hovered && (
                <foreignObject
                    x={x - 140}
                    y={-10}
                    width={280}
                    height={Math.min(annotations.length * 70 + 20, 250)}
                    style={{ overflow: 'visible', pointerEvents: 'auto' }}
                >
                    <div
                        className="bg-[#0a0a0f] border border-white/[0.1] rounded-xl shadow-2xl p-3 space-y-2"
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                    >
                        <p className="text-[10px] text-zinc-600 font-medium">
                            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                            })}
                        </p>
                        {annotations.map(a => (
                            <div key={a.id} className="group">
                                <div className="flex items-start gap-2">
                                    <div
                                        className="mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: (a.color || getCategoryColor(a.category)) + '20', color: a.color || getCategoryColor(a.category) }}
                                    >
                                        <CategoryIcon category={a.category} size={10} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-semibold text-white truncate">{a.title}</span>
                                            <span
                                                className="text-[8px] px-1.5 py-0.5 rounded-full font-medium"
                                                style={{
                                                    backgroundColor: (a.color || getCategoryColor(a.category)) + '15',
                                                    color: a.color || getCategoryColor(a.category),
                                                }}
                                            >
                                                {ANNOTATION_CATEGORIES.find(c => c.key === a.category)?.label || a.category}
                                            </span>
                                        </div>
                                        {a.description && (
                                            <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{a.description}</p>
                                        )}
                                        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
                                            {a.url && (
                                                <a
                                                    href={a.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-0.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-blue-400 transition"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                            {onEdit && a.source === 'manual' && (
                                                <button
                                                    className="p-0.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition"
                                                    onClick={e => { e.stopPropagation(); onEdit(a); }}
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                            )}
                                            {onDelete && a.source === 'manual' && (
                                                <button
                                                    className="p-0.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-red-400 transition"
                                                    onClick={e => { e.stopPropagation(); onDelete(a.id); }}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </foreignObject>
            )}
        </g>
    );
}

// ─── Custom Label for ReferenceLine (renders the marker group) ───
interface AnnotationLabelProps {
    viewBox?: { x: number; y?: number; width?: number; height?: number };
    annotations: ChartAnnotation[];
    date: string;
    chartHeight: number;
    onEdit?: (annotation: ChartAnnotation) => void;
    onDelete?: (id: number) => void;
}

function AnnotationLabel({ viewBox, annotations, date, chartHeight, onEdit, onDelete }: AnnotationLabelProps) {
    if (!viewBox) return null;
    const x = viewBox.x || 0;
    return (
        <AnnotationMarker
            annotations={annotations}
            date={date}
            x={x}
            y={chartHeight - 25}
            onEdit={onEdit}
            onDelete={onDelete}
        />
    );
}

// ─── Main Export: generates ReferenceLine elements for each annotation date ───
export interface ChartAnnotationsProps {
    annotations: ChartAnnotation[];
    chartHeight?: number;
    onEdit?: (annotation: ChartAnnotation) => void;
    onDelete?: (id: number) => void;
}

/**
 * Returns an array of Recharts <ReferenceLine> elements to spread into an
 * AreaChart or LineChart. Annotations on the same date are grouped.
 *
 * Usage:
 * ```tsx
 * <AreaChart ...>
 *   {/* other elements *\/}
 *   {...getAnnotationLines({ annotations, chartHeight: 300, onEdit, onDelete })}
 * </AreaChart>
 * ```
 */
export function getAnnotationLines({
    annotations,
    chartHeight = 300,
    onEdit,
    onDelete,
}: ChartAnnotationsProps) {
    if (!annotations.length) return [];

    // Group annotations by date
    const grouped = new Map<string, ChartAnnotation[]>();
    for (const a of annotations) {
        const existing = grouped.get(a.date) || [];
        existing.push(a);
        grouped.set(a.date, existing);
    }

    return Array.from(grouped.entries()).map(([date, group]) => {
        const primary = group[0];
        const color = primary.color || getCategoryColor(primary.category);
        return (
            <ReferenceLine
                key={`annotation-${date}`}
                x={date}
                stroke={color}
                strokeDasharray="3 3"
                strokeOpacity={0}
                label={
                    <AnnotationLabel
                        annotations={group}
                        date={date}
                        chartHeight={chartHeight}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                }
            />
        );
    });
}

// ─── Add Annotation Button (for chart toolbar) ───
export function AddAnnotationButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title="Add annotation"
            className="flex items-center gap-1 text-[10px] text-zinc-500 border border-white/[0.06] rounded-md px-2 py-1 hover:border-white/[0.12] hover:text-zinc-300 transition"
        >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">Annotate</span>
        </button>
    );
}

// ─── Toggle Annotations Button ───
export function ToggleAnnotationsButton({
    show,
    count,
    onClick,
}: {
    show: boolean;
    count: number;
    onClick: () => void;
}) {
    if (count === 0) return null;
    return (
        <button
            onClick={onClick}
            title={show ? 'Hide annotations' : 'Show annotations'}
            className={`flex items-center gap-1 text-[10px] border rounded-md px-2 py-1 transition ${
                show
                    ? 'text-zinc-300 border-white/[0.12] bg-white/[0.04]'
                    : 'text-zinc-500 border-white/[0.06] hover:border-white/[0.12] hover:text-zinc-400'
            }`}
        >
            <StickyNote className="w-3 h-3" />
            {count}
        </button>
    );
}
