'use client';

import { useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import {
  DEFAULT_SECTION_ORDER,
  type ShareSectionId,
  type NormalizedShareConfig,
} from '@/lib/shareTypes';

const SECTION_LABELS: Record<ShareSectionId, string> = {
  metrics: 'KPI cards + main chart',
  sources: 'Sources / Refs',
  geo: 'Geography',
  devices: 'Devices / Browsers',
  pages: 'Top Pages',
  events: 'Events / Conversions',
  liveGeo: 'Live Geo globe',
};

const SECTION_DESCRIPTIONS: Record<ShareSectionId, string> = {
  metrics: 'Active Users / Sessions / Pageviews / Pages per session + selected-metric chart',
  sources: 'Refs / URLs / UTM source / medium / campaign breakdown',
  geo: 'Country / region / city tables',
  devices: 'Devices / browsers / OS / brand / model',
  pages: 'Top pages, entries, exits',
  events: 'Events / conversions / link-out',
  liveGeo: 'Realtime globe + activity feed',
};

interface Props {
  draft: NormalizedShareConfig;
  onChange: (next: NormalizedShareConfig) => void;
}

export default function ShareSectionList({ draft, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const order = useMemo<ShareSectionId[]>(
    () => (draft.sectionOrder?.length ? draft.sectionOrder : DEFAULT_SECTION_ORDER),
    [draft.sectionOrder],
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as ShareSectionId);
    const newIndex = order.indexOf(over.id as ShareSectionId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    onChange({ ...draft, sectionOrder: next });
  }

  function toggleVisibility(id: ShareSectionId) {
    const current = draft.sectionVisibility[id] !== false;
    onChange({
      ...draft,
      sectionVisibility: { ...draft.sectionVisibility, [id]: !current },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">Section layout</h3>
        <span className="text-[9px] uppercase tracking-wider text-white/30">drag to reorder</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {order.map((id) => (
              <SortableRow
                key={id}
                id={id}
                visible={draft.sectionVisibility[id] !== false}
                onToggle={() => toggleVisibility(id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p className="px-1 text-[10px] leading-relaxed text-white/30">
        Sections render top-to-bottom in the public view. Hidden sections are skipped entirely.
      </p>
    </div>
  );
}

function SortableRow({
  id,
  visible,
  onToggle,
}: {
  id: ShareSectionId;
  visible: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
        visible
          ? 'border-white/[0.08] bg-white/[0.03]'
          : 'border-white/[0.04] bg-white/[0.015] opacity-60'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab touch-none rounded p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/70 active:cursor-grabbing"
        aria-label={`Drag ${SECTION_LABELS[id]}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-white/85">{SECTION_LABELS[id]}</div>
        <div className="truncate text-[10px] text-white/40">{SECTION_DESCRIPTIONS[id]}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition ${
          visible
            ? 'bg-[var(--db-primary,#14C4E1)]/15 text-[var(--db-primary,#14C4E1)] hover:bg-[var(--db-primary,#14C4E1)]/25'
            : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
        }`}
        title={visible ? 'Hide this section in the public view' : 'Show this section'}
        aria-label={visible ? 'Hide section' : 'Show section'}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
