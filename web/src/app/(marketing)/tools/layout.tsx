import { ConnectGoogleButton } from '@/components/marketing/site/ConnectGoogleButton';

/** Shell for the free tools: the tool, then one quiet card about the free product. */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <div className="mx-auto max-w-[1200px] px-4 pb-16 md:px-6 md:pb-24">
                <div className="mx-auto flex max-w-[880px] flex-col gap-4 rounded-card border border-border-subtle bg-surface p-6 shadow-card sm:flex-row sm:items-center">
                    <div className="flex-1">
                        <p className="text-title text-fg">Want the numbers for every site you own?</p>
                        <p className="mt-1 text-body text-fg-secondary">
                            Connect Google once and see Search Console and Analytics for all your sites on one screen. Free, read-only, no site limit.
                        </p>
                    </div>
                    <ConnectGoogleButton size="lg" mark className="self-start sm:self-auto" />
                </div>
            </div>
        </>
    );
}
