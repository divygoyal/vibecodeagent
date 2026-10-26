import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Pill, type PillTone } from '@/components/ui/Pill';

/** Container state to Pill tone: up = running, down = error, warn = pending, neutral = everything else. */
export function containerTone(status?: string | null): PillTone {
    const s = (status || '').toLowerCase();
    if (s === 'running' || s === 'healthy') return 'up';
    if (s === 'error' || s === 'failed' || s === 'dead' || s === 'unhealthy') return 'down';
    if (s === 'initializing' || s === 'starting' || s === 'pending' || s === 'restarting' || s === 'created') return 'warn';
    return 'neutral';
}

/** Container state as a status pill with a dot ("running", "stopped", "none"). */
export function ContainerPill({ status, className }: { status?: string | null; className?: string }) {
    return (
        <Pill tone={containerTone(status)} dot className={className}>
            {status || 'none'}
        </Pill>
    );
}

const PLAN_VARIANT: Record<string, BadgeVariant> = {
    free: 'neutral',
    starter: 'info',
    growth: 'info',
    pro: 'brand',
};

/** Plan name as a Badge (free neutral, starter and growth info, pro brand). */
export function PlanBadge({ plan, className }: { plan?: string | null; className?: string }) {
    const key = (plan || 'free').toLowerCase();
    return (
        <Badge variant={PLAN_VARIANT[key] ?? 'neutral'} className={className}>
            {plan || 'free'}
        </Badge>
    );
}
