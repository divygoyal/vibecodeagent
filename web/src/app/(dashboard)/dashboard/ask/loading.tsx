import { Skeleton } from '@/components/ui/Skeleton';

/** Ask while the page loads: header, a row of prompt cards and the composer, same layout as the page. */
export default function Loading() {
    return (
        <div aria-hidden className="flex min-h-[calc(100dvh-7rem)] flex-col md:min-h-[calc(100dvh-9.5rem)]">
            <div className="mb-6 flex items-end justify-between gap-4">
                <div className="flex flex-col gap-2"><Skeleton className="h-7 w-24" /><Skeleton className="h-4 w-64" /></div>
                <Skeleton className="h-8 w-24" rounded="full" />
            </div>
            <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center gap-4 py-8">
                <Skeleton className="size-10" rounded="card" />
                <Skeleton className="h-7 w-72" />
                <div className="mt-4 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] w-full" rounded="card" />)}
                </div>
            </div>
            <div className="mx-auto w-full max-w-[760px] pt-2">
                <Skeleton className="h-[92px] w-full" rounded="card" />
            </div>
        </div>
    );
}
