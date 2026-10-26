import type { Metadata } from 'next';
import { ConnectAiClient } from '@/components/connect-ai/ConnectAiClient';
import { mcpEnabled, resourceUrl } from '@/lib/mcp/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect AI · TrafficClaw' };

export default function ConnectAiPage() {
    return (
        <div className="tc-root min-h-full bg-canvas px-4 py-6 text-fg md:px-6 md:py-8">
            <div className="mx-auto w-full max-w-[1120px]">
                <ConnectAiClient endpoint={resourceUrl()} enabled={mcpEnabled()} />
            </div>
        </div>
    );
}
