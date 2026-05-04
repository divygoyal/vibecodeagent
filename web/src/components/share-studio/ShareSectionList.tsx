'use client';

import { useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import {
  DEFAULT_SECTION_ORDER,
  type ShareSectionId,
  type NormalizedShareConfig,
} from '@/lib/shareTypes';

const SECTION_LABELS: Record<ShareSectionId, string> = {
  metrics: 'KPIs + chart',
  sources: 'Sources',
  geo: 'Geography',
  devices: 'Devices',
  pages: 'Top Pages',
  events: 'Events',
  liveGeo: 'Live globe',
};

const SECTION_DESCRIPTIONS: Record<ShareSectionId, string> = {
  metrics: 'KPI cards + main metric chart',
  sources: 'Refs / UTM / source tables',
  geo: 'Country / region / city',
  devices: 'Device / browser / OS',
  pages: 'Pages / entries / exits',
  events: 'Events / conversions',
  liveGeo: 'Realtime globe + activity',
};

/**
 * Sections that span the full content width on the public view (so they take
 * the whole row in the panel preview too). Everything else tiles in a 2-up grid
 * that mirrors the public dashboard's Sources↔Geo, Devices↔Pages, Events↔LiveGeo
 * pairing.
 */
const FULL_WIDTH_SECTIONS = new Set<ShareSectionId>(['metrics']);

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
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-2">
            {order.map((id) => (
              <SortableTile
                key={id}
                id={id}
                visible={draft.sectionVisibility[id] !== false}
                fullWidth={FULL_WIDTH_SECTIONS.has(id)}
                onToggle={() => toggleVisibility(id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p className="px-1 text-[10px] leading-relaxed text-white/30">
        Tiles mirror the public layout — pairs sit side-by-side, KPIs span the full row.
        Drag to reorder, click the eye to hide a section.
      </p>
    </div>
  );
}

function SortableTile({
  id,
  visible,
  fullWidth,
  onToggle,
}: {
  id: ShareSectionId;
  visible: boolean;
  fullWidth: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 transition ${
        fullWidth ? 'col-span-2' : ''
      } ${
        visible
          ? 'border-white/[0.08] bg-white/[0.03]'
          : 'border-dashed border-white/[0.05] bg-white/[0.015] opacity-60'
      } ${isDragging ? 'ring-1 ring-[var(--db-primary,#14C4E1)]/40' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none rounded p-0.5 text-white/30 hover:bg-white/[0.06] hover:text-white/70 active:cursor-grabbing"
          aria-label={`Drag ${SECTION_LABELS[id]}`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85">
          {SECTION_LABELS[id]}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition ${
            visible
              ? 'bg-[var(--db-primary,#14C4E1)]/15 text-[var(--db-primary,#14C4E1)] hover:bg-[var(--db-primary,#14C4E1)]/25'
              : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
          }`}
          title={visible ? 'Hide on public view' : 'Show on public view'}
          aria-label={visible ? 'Hide section' : 'Show section'}
        >
          {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </button>
      </div>
      <p className="line-clamp-2 text-[9px] leading-snug text-white/40">
        {SECTION_DESCRIPTIONS[id]}
      </p>
    </div>
  );
}
