import { Skeleton } from '@/components/ui/Skeleton';

/** Page placeholder while client-only parts (URL state) resolve. */
export function PageSkeleton() {
    return (
        <div aria-hidden className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-4">
                <div className="flex flex-col gap-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /></div>
                <Skeleton className="h-9 w-48" rounded="full" />
            </div>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" rounded="card" />)}
            </div>
        </div>
    );
}
