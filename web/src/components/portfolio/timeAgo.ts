/** "just now", "5 min ago", "3 h ago", "2 days ago" for an epoch-seconds time. */
export function timeAgo(epochS: number, now: number = Date.now()): string {
    const s = Math.max(0, Math.round(now / 1000 - epochS));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
    const d = Math.floor(s / 86_400);
    return `${d} day${d === 1 ? '' : 's'} ago`;
}
