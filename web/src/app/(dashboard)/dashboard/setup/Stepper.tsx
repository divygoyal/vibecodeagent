import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Setup progress (DESIGN 5.3): numbered dots joined by a line on desktop;
 * "Step 2 of 2" with a progress bar on phones. `current` is 1-based.
 */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
    return (
        <nav aria-label="Setup progress" className="mb-6">
            <div className="md:hidden">
                <p className="text-body-sm text-fg-muted">
                    Step {current} of {steps.length}: <span className="font-medium text-fg">{steps[current - 1]}</span>
                </p>
                <div role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current} aria-label="Setup progress" className="mt-2 h-1 overflow-hidden rounded-full bg-subtle">
                    <span className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(current / steps.length) * 100}%` }} />
                </div>
            </div>
            <ol className="hidden items-center md:flex">
                {steps.map((label, i) => {
                    const n = i + 1;
                    const done = n < current;
                    const active = n === current;
                    return (
                        <li key={label} aria-current={active ? 'step' : undefined} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
                            <span className="flex items-center gap-2.5">
                                <span
                                    className={cn(
                                        'flex size-6 shrink-0 items-center justify-center rounded-full text-meta font-medium tabular-nums',
                                        done && 'bg-brand text-brand-fg',
                                        active && 'border-2 border-brand text-fg',
                                        !done && !active && 'border border-border text-fg-muted',
                                    )}
                                >
                                    {done ? <Check aria-hidden size={14} strokeWidth={2.5} /> : n}
                                </span>
                                <span className={cn('text-body-sm', active ? 'font-medium text-fg' : 'text-fg-muted')}>{label}</span>
                            </span>
                            {i < steps.length - 1 ? <span aria-hidden className={cn('mx-4 h-px flex-1', done ? 'bg-brand' : 'bg-border')} /> : null}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
