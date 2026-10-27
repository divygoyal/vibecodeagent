/**
 * Deep links into the live demo (shared contract, round3/BRIEF.md): `/demo?to=<path under /dashboard>`
 * starts a read-only demo session and lands on that screen of the real app. Pure, client-safe.
 */
export function demoHref(path: string = '/dashboard'): string {
    return `/demo?to=${encodeURIComponent(path).replace(/%2F/gi, '/')}`;
}
