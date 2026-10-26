'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Plus, RotateCw, Server, Square, Trash2, ArrowUp, X, Circle, Users } from 'lucide-react';

import { AdminFrame } from '@/components/admin/AdminFrame';
import { AdminStat, UsageBar } from '@/components/admin/AdminStat';
import { TimeAgo } from '@/components/admin/TimeAgo';
import { ContainerPill, PlanBadge } from '@/components/admin/tones';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmModal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

/* ─── types ─── */
type SystemStatus = {
    total_users: number;
    running_containers: number;
    plan_breakdown: Record<string, number>;
    max_users: number;
    available_slots: number;
};

type UserInfo = {
    id: number;
    github_id: string;
    github_username: string | null;
    plan: string;
    container_status: string;
    container_port: number | null;
    is_active: boolean;
    created_at: string;
    container?: {
        status: string;
        health: string;
        memory_usage_mb?: number;
        container_id?: string;
        uptime?: string;
    };
};

type ContainerEvent = {
    id: number;
    user_id: number;
    container_id: string;
    event_type: string;
    details: string | null;
    created_at: string;
};

type UserDetailUser = {
    github_username?: string | null;
    email?: string | null;
    plan?: string;
    container_port?: number | null;
    is_active?: boolean;
    created_at?: string;
    container?: {
        status?: string;
        memory_usage_mb?: number;
        container_id?: string;
    } | null;
};

type UserDetail = {
    user: UserDetailUser | null;
    logs: { logs?: string } | string | null;
};

/* ─── helpers ─── */
const EVENT_ICON: Record<string, typeof Plus> = { create: Plus, delete: X, upgrade: ArrowUp, restart: RotateCw };
const EVENT_VARIANT: Record<string, BadgeVariant> = {
    create: 'up',
    delete: 'down',
    upgrade: 'brand',
    restart: 'info',
};

/* ═══════════════════════════════════════════════════════ */
export default function AdminPage() {
    const { data: session, status: sessionStatus } = useSession();
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [users, setUsers] = useState<UserInfo[]>([]);
    const [events, setEvents] = useState<ContainerEvent[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'events'>('users');
    const [deleteTarget, setDeleteTarget] = useState<{ githubId: string; label: string } | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [statusRes, usersRes, eventsRes] = await Promise.all([
                fetch('/api/admin?endpoint=status'),
                fetch('/api/admin?endpoint=users'),
                fetch('/api/admin?endpoint=events'),
            ]);

            if (statusRes.ok) setSystemStatus(await statusRes.json());
            if (usersRes.ok) setUsers(await usersRes.json());
            if (eventsRes.ok) setEvents(await eventsRes.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    const fetchUserDetail = useCallback(async (githubId: string) => {
        try {
            const res = await fetch(`/api/admin?endpoint=user-detail&id=${githubId}`);
            if (res.ok) setUserDetail(await res.json());
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        if (session?.user) {
            fetchData();
            const interval = setInterval(fetchData, 20000);
            return () => clearInterval(interval);
        }
    }, [session, fetchData]);

    useEffect(() => {
        if (selectedUser) fetchUserDetail(selectedUser);
    }, [selectedUser, fetchUserDetail]);

    const handleAction = async (action: string, githubId: string) => {
        setActionLoading(`${action}-${githubId}`);
        try {
            await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, githubId }),
            });
            setTimeout(fetchData, 2000);
            if (action === 'delete') {
                setSelectedUser(null);
                setUserDetail(null);
            }
        } catch { /* silent */ }
        finally { setActionLoading(null); }
    };

    const closeDetail = () => { setSelectedUser(null); setUserDetail(null); };

    /* ─── Auth check ─── */
    // Signed-out visitors never fetch, so only wait on `loading` once there is a session.
    if (sessionStatus === 'loading' || (loading && !!session?.user)) {
        return (
            <AdminFrame title="Admin">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-busy="true" aria-label="Loading admin panel">
                    {Array.from({ length: 5 }, (_, i) => (
                        <AdminStat key={i} label="Loading" loading className={i === 4 ? 'col-span-2 lg:col-span-1' : undefined} />
                    ))}
                </div>
                <div className="mt-6">
                    <Skeleton className="h-10 w-48" />
                </div>
                <div className="mt-4">
                    <Table<UserInfo> columns={USER_SKELETON_COLUMNS} rows={[]} rowKey={(u) => u.github_id} loading />
                </div>
            </AdminFrame>
        );
    }

    if (!session?.user) {
        return (
            <AdminFrame title="Admin">
                <Card padding="none">
                    <EmptyState icon={Users} variant="page" title="Please sign in first" description="The admin console needs a signed-in administrator account." />
                </Card>
            </AdminFrame>
        );
    }

    const capacity = Math.round(((systemStatus?.total_users ?? 0) / (systemStatus?.max_users ?? 50)) * 100);
    const plans = Object.entries(systemStatus?.plan_breakdown || {});

    const userColumns: TableColumn<UserInfo>[] = [
        {
            key: 'user',
            header: 'User',
            cell: (user) => (
                <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={user.github_username} src={`https://avatars.githubusercontent.com/u/${user.github_id}`} size={28} />
                    <span className="truncate font-medium">{user.github_username || 'unknown'}</span>
                </div>
            ),
        },
        { key: 'github_id', header: 'GitHub ID', cell: (user) => <code className="font-mono text-meta text-fg-secondary">{user.github_id}</code> },
        { key: 'plan', header: 'Plan', cell: (user) => <PlanBadge plan={user.plan} /> },
        { key: 'status', header: 'Status', cell: (user) => <ContainerPill status={user.container_status} /> },
        { key: 'port', header: 'Port', cell: (user) => <code className="font-mono text-meta text-fg-secondary">{user.container_port || '–'}</code> },
        {
            key: 'memory',
            header: 'Memory',
            cell: (user) => <span className="text-fg-secondary">{user.container?.memory_usage_mb ? `${user.container.memory_usage_mb} MB` : '–'}</span>,
        },
        { key: 'created', header: 'Created', cell: (user) => <TimeAgo value={user.created_at} className="text-meta text-fg-muted" /> },
        {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            cell: (user) => {
                const name = user.github_username || user.github_id;
                const running = user.container_status === 'running';
                return (
                    // Row clicks and Enter/Space on the row open the detail; keep the buttons out of that.
                    <div
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <Tooltip content={running ? 'Stop' : 'Start'}>
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                icon={running ? Square : Play}
                                aria-label={`${running ? 'Stop' : 'Start'} ${name}`}
                                loading={actionLoading === `${running ? 'stop' : 'start'}-${user.github_id}`}
                                onClick={() => handleAction(running ? 'stop' : 'start', user.github_id)}
                            />
                        </Tooltip>
                        <Tooltip content="Restart">
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                icon={RotateCw}
                                aria-label={`Restart ${name}`}
                                loading={actionLoading === `restart-${user.github_id}`}
                                onClick={() => handleAction('restart', user.github_id)}
                            />
                        </Tooltip>
                        <Tooltip content="Delete">
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                icon={Trash2}
                                aria-label={`Delete ${name}`}
                                loading={actionLoading === `delete-${user.github_id}`}
                                className="hover:text-down"
                                onClick={() => setDeleteTarget({ githubId: user.github_id, label: name })}
                            />
                        </Tooltip>
                    </div>
                );
            },
        },
    ];

    const detailUser = userDetail?.user ?? null;
    const detailStatus = detailUser?.container?.status || 'unknown';
    const detailRunning = detailStatus === 'running';
    const logsText = userDetail
        ? typeof userDetail.logs === 'string'
            ? userDetail.logs
            : userDetail.logs?.logs || 'No logs available'
        : null;

    /* ═══════════════════════════════════════════════ */
    return (
        <AdminFrame
            title="Admin"
            badge={<Badge variant="neutral">God mode</Badge>}
            actions={
                <>
                    <Button asChild variant="ghost" size="sm" icon={ArrowLeft}>
                        <Link href="/">Dashboard</Link>
                    </Button>
                    {session.user?.image ? <Avatar name={session.user.name} src={session.user.image} size={24} /> : null}
                </>
            }
        >
            {/* ─── System Overview ─── */}
            <section aria-label="System overview" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <AdminStat icon={Users} label="Total users" value={systemStatus?.total_users ?? '–'} sub="registered accounts" />
                <AdminStat
                    icon={Server}
                    label="Running containers"
                    value={systemStatus?.running_containers ?? '–'}
                    sub={`of ${systemStatus?.total_users ?? '–'} containers`}
                />
                <AdminStat
                    icon={Server}
                    label="Slots available"
                    value={systemStatus?.available_slots ?? '–'}
                    sub={`left of ${systemStatus?.max_users ?? 50}`}
                />
                <AdminStat icon={Server} label="Capacity" value={`${capacity}%`} sub={`max ${systemStatus?.max_users ?? 50} users`}>
                    <UsageBar percent={capacity} label="Capacity used" />
                </AdminStat>
                <AdminStat
                    label="Plans"
                    sub="plan breakdown"
                    className="col-span-2 lg:col-span-1"
                    value={
                        plans.length ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
                                {plans.map(([name, count]) => (
                                    <span key={name} className="inline-flex items-center gap-1.5">
                                        <PlanBadge plan={name} />
                                        <span className="font-medium tabular-nums">{count}</span>
                                    </span>
                                ))}
                            </div>
                        ) : '–'
                    }
                />
            </section>

            {/* ─── Tabs ─── */}
            <Tabs
                className="mt-6"
                ariaLabel="Admin sections"
                panelIdPrefix="admin-panel"
                value={activeTab}
                onValueChange={setActiveTab}
                items={[
                    { value: 'users', label: 'Users', count: users.length },
                    { value: 'events', label: 'Events', count: events.length },
                ]}
            />

            <div className="mt-4" role="tabpanel" id={`admin-panel-${activeTab}`}>
                {activeTab === 'users' ? (
                    /* ─── Users Table ─── */
                    <Table<UserInfo>
                        caption="Users"
                        columns={userColumns}
                        rows={users}
                        rowKey={(u) => u.github_id}
                        onRowClick={(u) => setSelectedUser(u.github_id)}
                        empty={<EmptyState variant="inline" icon={Users} title="No users yet" description="Users appear here after they sign in for the first time." />}
                    />
                ) : (
                    /* ─── Events Timeline ─── */
                    <Card padding="none">
                        {events.length === 0 ? (
                            <EmptyState variant="card" icon={Circle} title="No events yet" description="Container events show up here as they happen." />
                        ) : (
                            <ul className="divide-y divide-border-subtle">
                                {events.map((event) => {
                                    const Icon = EVENT_ICON[event.event_type] ?? Circle;
                                    return (
                                        <li key={event.id} className="flex items-start gap-3 px-4 py-3">
                                            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-control bg-subtle text-fg-muted">
                                                <Icon size={14} strokeWidth={1.75} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant={EVENT_VARIANT[event.event_type] ?? 'neutral'}>{event.event_type}</Badge>
                                                    <code className="truncate font-mono text-meta text-fg-muted">{event.container_id?.substring(0, 12)}</code>
                                                </div>
                                                {event.details ? <p className="mt-1 text-body-sm text-fg-secondary">{event.details}</p> : null}
                                            </div>
                                            <TimeAgo value={event.created_at} className="shrink-0 text-meta text-fg-muted" />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                )}
            </div>

            {/* ─── User Detail Drawer ─── */}
            <Drawer
                open={!!selectedUser}
                onOpenChange={(open) => { if (!open) closeDetail(); }}
                title={detailUser?.github_username || 'User detail'}
                subtitle={selectedUser ? <span className="font-mono">ID {selectedUser}</span> : undefined}
                footer={
                    selectedUser && detailUser ? (
                        <div className="flex flex-wrap gap-2">
                            {detailRunning ? (
                                <Button variant="secondary" icon={Square} disabled={!!actionLoading} onClick={() => handleAction('stop', selectedUser)}>
                                    Stop
                                </Button>
                            ) : (
                                <Button variant="secondary" icon={Play} disabled={!!actionLoading} onClick={() => handleAction('start', selectedUser)}>
                                    Start
                                </Button>
                            )}
                            <Button variant="secondary" icon={RotateCw} disabled={!!actionLoading} onClick={() => handleAction('restart', selectedUser)}>
                                Restart
                            </Button>
                            <Button
                                variant="danger"
                                icon={Trash2}
                                disabled={!!actionLoading}
                                className="ml-auto"
                                onClick={() => setDeleteTarget({ githubId: selectedUser, label: detailUser.github_username || selectedUser })}
                            >
                                Delete
                            </Button>
                        </div>
                    ) : undefined
                }
            >
                {selectedUser && !userDetail ? (
                    <div className="space-y-4" aria-busy="true">
                        <div className="flex items-center gap-3">
                            <Skeleton rounded="full" className="size-12" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}
                        </div>
                        <Skeleton className="h-40" />
                    </div>
                ) : null}

                {selectedUser && detailUser ? (
                    <div className="space-y-5">
                        {/* Profile */}
                        <div className="flex items-center gap-3">
                            <Avatar name={detailUser.github_username} src={`https://avatars.githubusercontent.com/u/${selectedUser}`} size={40} />
                            <div className="min-w-0">
                                <div className="truncate text-title-sm">{detailUser.github_username || 'Unknown'}</div>
                                {detailUser.email ? <div className="truncate text-body-sm text-fg-muted">{detailUser.email}</div> : null}
                            </div>
                        </div>

                        {/* Info Grid */}
                        <dl className="grid grid-cols-2 gap-2">
                            {[
                                { label: 'Plan', value: <PlanBadge plan={detailUser.plan} /> },
                                { label: 'Status', value: <ContainerPill status={detailStatus} /> },
                                { label: 'Port', value: <span className="font-mono">{detailUser.container_port || '–'}</span> },
                                { label: 'Memory', value: detailUser.container?.memory_usage_mb ? `${detailUser.container.memory_usage_mb} MB` : '–' },
                                { label: 'Active', value: detailUser.is_active ? 'Yes' : 'No' },
                                { label: 'Created', value: <TimeAgo value={detailUser.created_at} /> },
                            ].map((item) => (
                                <div key={item.label} className="rounded-control bg-surface-sunken p-3">
                                    <dt className="text-meta text-fg-muted">{item.label}</dt>
                                    <dd className="mt-1 text-body font-medium">{item.value}</dd>
                                </div>
                            ))}
                        </dl>

                        {/* Container ID */}
                        {detailUser.container?.container_id ? (
                            <div className="rounded-control bg-surface-sunken p-3">
                                <div className="text-meta text-fg-muted">Container ID</div>
                                <code className="mt-1 block font-mono text-meta break-all text-fg">{detailUser.container.container_id}</code>
                            </div>
                        ) : null}

                        {/* Logs */}
                        {logsText !== null ? (
                            <div>
                                <h3 className="mb-2 text-body-sm font-medium text-fg-secondary">Recent logs</h3>
                                <div className={cn('max-h-72 overflow-y-auto rounded-control border border-border-subtle bg-surface-sunken p-3')}>
                                    <pre className="font-mono text-meta leading-relaxed whitespace-pre-wrap text-fg-secondary">{logsText}</pre>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Drawer>

            <ConfirmModal
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                title={`Delete ${deleteTarget?.label ?? 'user'}?`}
                description="This deletes the user, their container and all their data. It cannot be undone."
                confirmLabel="Delete user"
                loading={!!deleteTarget && actionLoading === `delete-${deleteTarget.githubId}`}
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    await handleAction('delete', deleteTarget.githubId);
                    setDeleteTarget(null);
                }}
            />
        </AdminFrame>
    );
}

/** Column shapes for the loading skeleton (header text matches the final table). */
const USER_SKELETON_COLUMNS: TableColumn<UserInfo>[] = ['User', 'GitHub ID', 'Plan', 'Status', 'Port', 'Memory', 'Created', 'Actions'].map((h) => ({
    key: h,
    header: h,
    cell: () => null,
}));
