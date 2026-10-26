'use client';

/** Fixture: a Client Component that accepts anything. */
export function ClientList(props: Record<string, unknown>) {
    return <div data-props={Object.keys(props).join(',')} />;
}
