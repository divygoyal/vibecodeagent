/** Per-client setup instructions (MCP.md section 10), parameterised by the server URL. */

export interface SetupSnippet {
    label: string;
    code: string;
}

export interface SetupClient {
    id: 'chatgpt' | 'claude' | 'claude-desktop' | 'claude-code' | 'cursor' | 'vscode' | 'other';
    name: string;
    steps: string[];
    snippets: (url: string) => SetupSnippet[];
    note?: string;
}

export const SETUP_CLIENTS: SetupClient[] = [
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        steps: [
            'Open chatgpt.com, go to Settings > Apps (or Plugins) and choose "Add custom MCP server". Custom servers may need developer mode, or an admin in Business and Enterprise workspaces.',
            'Name it TrafficClaw, paste the server URL and pick OAuth (leave client settings on automatic).',
            'Confirm, then sign in with Google in the TrafficClaw window, choose which sites to share and click Allow.',
            'In a chat, pick TrafficClaw and ask a question.',
        ],
        snippets: (url) => [{ label: 'Server URL', code: url }],
    },
    {
        id: 'claude',
        name: 'Claude.ai',
        steps: [
            'Open Settings > Connectors > Add custom connector.',
            'Paste the server URL. For the OAuth client choose "Use Claude\'s published identity" ("Register automatically" also works).',
            'Click Add, then Connect. Sign in with Google, choose sites and click Allow.',
            'In a chat, open + > Connectors and make sure TrafficClaw is on.',
        ],
        snippets: (url) => [{ label: 'Server URL', code: url }],
        note: 'Team and Enterprise: an Owner adds it under Organization settings > Connectors; each member then connects their own Google account.',
    },
    {
        id: 'claude-desktop',
        name: 'Claude Desktop',
        steps: [
            'Claude Desktop and the Claude mobile apps share the connectors you add on claude.ai.',
            'Add the connector on claude.ai (see the Claude.ai tab), then restart Claude Desktop.',
            'Turn TrafficClaw on from the + > Connectors menu in a chat.',
        ],
        snippets: (url) => [{ label: 'Server URL', code: url }],
    },
    {
        id: 'claude-code',
        name: 'Claude Code',
        steps: [
            'Run the command below in your terminal (add --scope user to use it in every project).',
            'Inside Claude Code run /mcp, choose trafficclaw and Authenticate. On a remote machine use claude mcp login trafficclaw --no-browser.',
        ],
        snippets: (url) => [
            { label: 'Add the server', code: `claude mcp add --transport http trafficclaw ${url}` },
            { label: 'Project .mcp.json', code: JSON.stringify({ mcpServers: { trafficclaw: { type: 'http', url } } }, null, 2) },
            { label: 'With an API key instead of OAuth', code: `claude mcp add --transport http trafficclaw ${url} --header "Authorization: Bearer tcak_YOUR_KEY"` },
        ],
    },
    {
        id: 'cursor',
        name: 'Cursor',
        steps: [
            'Add TrafficClaw to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).',
            'Cursor opens your browser to sign in and approve the sites.',
        ],
        snippets: (url) => [
            { label: 'mcp.json', code: JSON.stringify({ mcpServers: { trafficclaw: { url } } }, null, 2) },
            { label: 'With an API key', code: JSON.stringify({ mcpServers: { trafficclaw: { url, headers: { Authorization: 'Bearer ${env:TRAFFICCLAW_KEY}' } } } }, null, 2) },
        ],
    },
    {
        id: 'vscode',
        name: 'VS Code',
        steps: [
            'Command Palette > MCP: Add Server > HTTP, paste the server URL and name it trafficclaw. Or add .vscode/mcp.json as below.',
            'Sign in when VS Code asks, then use it from Copilot Chat in agent mode.',
        ],
        snippets: (url) => [
            { label: '.vscode/mcp.json', code: JSON.stringify({ servers: { trafficclaw: { type: 'http', url } } }, null, 2) },
            {
                label: 'With an API key',
                code: JSON.stringify({
                    inputs: [{ type: 'promptString', id: 'trafficclaw-key', description: 'TrafficClaw API key', password: true }],
                    servers: { trafficclaw: { type: 'http', url, headers: { Authorization: 'Bearer ${input:trafficclaw-key}' } } },
                }, null, 2),
            },
        ],
    },
    {
        id: 'other',
        name: 'Other',
        steps: [
            'Any MCP client that speaks Streamable HTTP: use the server URL and sign in with OAuth when asked.',
            'Clients without OAuth: create an API key below and send it as "Authorization: Bearer tcak_…".',
            'Clients that only speak stdio can use the mcp-remote bridge.',
        ],
        snippets: (url) => [
            { label: 'Server URL', code: url },
            { label: 'stdio bridge', code: `npx -y mcp-remote ${url}` },
        ],
    },
];

export const EXAMPLE_PROMPTS = [
    'Compare all my sites over the last 28 days and tell me which one needs attention.',
    'Which of my sites lost the most clicks this week, and why?',
    'Which queries for my main site are on page two of Google and worth improving?',
    'How many people are on my site right now?',
    'What should I fix first?',
];
