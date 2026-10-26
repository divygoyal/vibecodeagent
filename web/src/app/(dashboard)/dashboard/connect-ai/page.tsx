import type { Metadata } from 'next';
import { ConnectAiClient } from '@/components/connect-ai/ConnectAiClient';
import { mcpEnabled, resourceUrl } from '@/lib/mcp/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect AI · TrafficClaw' };

/** Connect AI (DESIGN 5.13): MCP setup, connected apps, API keys and usage. */
export default function ConnectAiPage() {
    return <ConnectAiClient endpoint={resourceUrl()} enabled={mcpEnabled()} />;
}
