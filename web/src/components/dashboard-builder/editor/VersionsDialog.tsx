'use client';

/** Version history (P1): the last 20 saved revisions; restoring is an undoable edit. */
import useSWR from 'swr';
import { History } from 'lucide-react';
import { toast } from 'sonner';

import { Button, EmptyState, Modal } from '@/components/ui';
import type { DashboardDocV2 } from '@/lib/builder/types';
import { useEditorStore } from '@/stores/dashboardEditorStore';
import { fetchJson } from '../useWidgetData';

export function VersionsDialog({ open, onOpenChange, dashboardId }: { open: boolean; onOpenChange: (o: boolean) => void; dashboardId: string }) {
    const { data, isLoading } = useSWR<{ versions: Array<{ rev: number; label: string | null; createdAt: string | null }> }>(open ? `/api/dashboards/${dashboardId}/versions` : null, (u: string) => fetchJson(u));
    const current = useEditorStore((s) => s.rev);
    const restore = async (rev: number) => {
        const v = await fetchJson<{ doc: DashboardDocV2 }>(`/api/dashboards/${dashboardId}/versions?rev=${rev}`);
        if (!v.doc || v.doc.schemaVersion !== 2) {
            toast.error('That version cannot be restored');
            return;
        }
        useEditorStore.getState().apply(() => v.doc, { announce: `Restored version ${rev}` });
        toast.success(`Restored version ${rev}. Undo to go back.`);
        onOpenChange(false);
    };
    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Version history" description="The last 20 saves. Restoring keeps the current version in undo." size="md">
            {isLoading ? <p className="text-body-sm text-fg-muted">Loading…</p> : !data?.versions.length ? (
                <EmptyState variant="inline" icon={History} title="No saved versions yet" description="Versions appear after the first save in the new editor." />
            ) : (
                <ul className="divide-y divide-border-subtle">
                    {data.versions.map((v) => (
                        <li key={`${v.rev}-${v.createdAt}`} className="flex items-center justify-between gap-3 py-2">
                            <div>
                                <p className="text-body text-fg">Version {v.rev}{v.rev === current ? ' (current)' : ''}</p>
                                <p className="text-meta text-fg-muted">{v.createdAt ? new Date(`${v.createdAt}Z`).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''}{v.label ? ` · ${v.label}` : ''}</p>
                            </div>
                            <Button size="sm" variant="secondary" disabled={v.rev === current} onClick={() => void restore(v.rev)}>Restore</Button>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
}
