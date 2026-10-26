/**
 * "Export my data": a JSON file assembled in the browser from the same
 * endpoints the app already uses, so it contains exactly what the signed-in
 * user can see. Your Google data stays in Google; this is what TrafficClaw
 * itself keeps about you.
 */

interface ExportSource {
    key: string;
    url: string;
    /** Pick the useful part of the response. */
    pick?: (data: unknown) => unknown;
}

const SOURCES: ExportSource[] = [
    { key: 'plan', url: '/api/credits' },
    { key: 'workspace', url: '/api/user/workspace' },
    { key: 'dashboards', url: '/api/dashboards', pick: (d) => (d as { dashboards?: unknown })?.dashboards ?? d },
    { key: 'askThreads', url: '/api/chat-store?action=list_threads&limit=200', pick: (d) => (d as { threads?: unknown })?.threads ?? d },
    { key: 'askMemory', url: '/api/chat-store?action=list_facts', pick: (d) => (d as { facts?: unknown })?.facts ?? d },
    { key: 'supportMessages', url: '/api/support/messages', pick: (d) => (d as { messages?: unknown })?.messages ?? d },
];

const LOCAL_KEYS = ['tc-notification-prefs', 'tc-theme', 'tc-sidebar'];

export async function buildAccountExport(profile: { name?: string | null; email?: string | null }): Promise<{ file: string; sections: string[]; missing: string[] }> {
    const results = await Promise.allSettled(
        SOURCES.map(async (s) => {
            const res = await fetch(s.url, { cache: 'no-store' });
            if (!res.ok) throw new Error(String(res.status));
            const json = await res.json();
            return { key: s.key, value: s.pick ? s.pick(json) : json };
        }),
    );

    const data: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        account: { name: profile.name ?? null, email: profile.email ?? null },
    };
    const sections: string[] = ['account'];
    const missing: string[] = [];
    results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
            data[r.value.key] = r.value.value;
            sections.push(r.value.key);
        } else {
            missing.push(SOURCES[i].key);
        }
    });

    const local: Record<string, string> = {};
    for (const k of LOCAL_KEYS) {
        try {
            const v = localStorage.getItem(k);
            if (v !== null) local[k] = v;
        } catch { /* storage blocked */ }
    }
    data.deviceSettings = local;
    if (missing.length) data.notExported = missing;

    return { file: JSON.stringify(data, null, 2), sections, missing };
}

export function downloadJson(file: string, name: string) {
    const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
