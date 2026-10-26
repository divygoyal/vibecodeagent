'use client';

import { AppShell } from '@/components/shell/AppShell';

// Old pages import these from '../layout'; the context now lives in components/shell.
export { useRegistration, useWorkspace } from '@/components/shell/workspaceContext';
export type { WorkspaceSaveInput } from '@/components/shell/workspaceContext';

/**
 * Every /dashboard page renders inside the new app shell (sidebar, topbar,
 * mobile drawer and tab bar). See components/shell/AppShell.tsx.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
