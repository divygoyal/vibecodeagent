'use client';

import { useCallback, useState } from 'react';

import { cn } from '@/lib/cn';

export interface AvatarProps {
    name?: string | null;
    src?: string | null;
    size?: 24 | 28 | 32 | 40;
    className?: string;
}

function initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Person avatar: image or initials on brand-soft (DESIGN 3.19). */
export function Avatar({ name, src, size = 28, className }: AvatarProps) {
    // Failure is remembered per source, so a new source gets a fresh try.
    const [failedFor, setFailedFor] = useState<string | null>(null);
    const failed = failedFor !== null && failedFor === (src ?? '');
    // An image that failed before hydration never fires onError: check when it mounts.
    const imgRef = useCallback((img: HTMLImageElement | null) => {
        if (img && img.complete && img.naturalWidth === 0) {
            const key = src ?? '';
            window.requestAnimationFrame(() => setFailedFor(key));
        }
    }, [src]);
    const box = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className);
    if (src && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
            ref={imgRef}
                src={src}
                alt=""
                width={size}
                height={size}
                referrerPolicy="no-referrer"
                onError={() => setFailedFor(src ?? '')}
                className={cn(box, 'object-cover')}
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <span
            aria-hidden
            className={cn(box, 'bg-brand-soft text-meta font-semibold text-brand-soft-fg', size <= 24 && 'text-caption tracking-normal')}
            style={{ width: size, height: size }}
        >
            {initials(name)}
        </span>
    );
}
