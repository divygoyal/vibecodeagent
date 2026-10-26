/**
 * Join class names, skipping falsy values (a tiny clsx). No tailwind-merge:
 * when a caller passes `className`, put it LAST and avoid conflicting
 * utilities in the base classes you want callers to override.
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, unknown>;

export function cn(...inputs: ClassValue[]): string {
    const out: string[] = [];
    const walk = (v: ClassValue) => {
        if (!v && v !== 0) return;
        if (typeof v === 'string' || typeof v === 'number') {
            out.push(String(v));
        } else if (Array.isArray(v)) {
            v.forEach(walk);
        } else if (typeof v === 'object') {
            for (const [k, on] of Object.entries(v)) if (on) out.push(k);
        }
    };
    inputs.forEach(walk);
    return out.join(' ');
}
