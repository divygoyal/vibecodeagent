'use client';

import Link from 'next/link';
import { Plug } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/shell/PageHeader';

/** Connect AI (MCP) placeholder. The MCP stream replaces this page (DESIGN 5.13). */
export default function ConnectAiPage() {
    return (
        <>
            <PageHeader title="Connect AI" subtitle="Use your Google Analytics and Search Console in ChatGPT and Claude" />
            <Card padding="none">
                <EmptyState
                    variant="page"
                    icon={Plug}
                    title="Connect ChatGPT or Claude"
                    description="One-click setup for ChatGPT, Claude, Cursor and VS Code is coming here. Until then, ask about your traffic in the app."
                    actions={<Button asChild variant="primary"><Link href="/dashboard/ask">Open Ask</Link></Button>}
                />
            </Card>
        </>
    );
}
