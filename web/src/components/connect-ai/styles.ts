/** Class strings for Connect AI screens (DESIGN.md 3.x), built on the --tc-* tokens. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const s = {
    canvas: 'bg-[var(--tc-canvas)] text-[var(--tc-fg)]',
    card: 'bg-[var(--tc-surface)] border border-[var(--tc-border-subtle)] rounded-xl shadow-[var(--tc-shadow-card)]',
    sunken: 'bg-[var(--tc-surface-sunken)] border border-[var(--tc-border-subtle)] rounded-lg',
    title: 'text-[18px] leading-[26px] font-semibold text-[var(--tc-fg)]',
    titleSm: 'text-[15px] leading-[22px] font-semibold text-[var(--tc-fg)]',
    heading: 'text-2xl leading-8 font-semibold tracking-[-0.01em] text-[var(--tc-fg)]',
    body: 'text-sm leading-5 text-[var(--tc-fg)]',
    bodySm: 'text-[13px] leading-[18px] text-[var(--tc-fg-secondary)]',
    muted: 'text-[var(--tc-fg-muted)]',
    meta: 'text-xs leading-4 text-[var(--tc-fg-muted)]',
    mono: 'font-mono text-[13px]',
    btn: 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
    btnSm: 'h-8 px-3 text-[13px]',
    btnMd: 'h-9 px-3.5 text-sm',
    btnLg: 'h-11 px-5 text-[15px]',
    primary: 'bg-[var(--tc-brand)] text-[var(--tc-brand-fg)] hover:bg-[var(--tc-brand-hover)]',
    secondary: 'bg-[var(--tc-surface)] border border-[var(--tc-border)] text-[var(--tc-fg)] shadow-[var(--tc-shadow-xs)] hover:bg-[var(--tc-subtle)] hover:border-[var(--tc-border-strong)]',
    ghost: 'text-[var(--tc-fg-secondary)] hover:bg-[var(--tc-subtle)] hover:text-[var(--tc-fg)]',
    dangerText: 'text-[var(--tc-down)] hover:bg-[var(--tc-down-soft)]',
    input: 'h-9 w-full rounded-lg border border-[var(--tc-border)] bg-[var(--tc-surface)] px-3 text-sm text-[var(--tc-fg)] placeholder:text-[var(--tc-fg-faint)] focus:border-[var(--tc-focus)] focus:outline-none',
    pill: 'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
    badge: 'inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium uppercase tracking-[0.04em]',
};
