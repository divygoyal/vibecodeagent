import { MarketingFooter } from '@/components/marketing/site/MarketingFooter';
import { MarketingHeader } from '@/components/marketing/site/MarketingHeader';

/**
 * Public site shell. Always light (DESIGN 2.1): the data-theme attribute here
 * overrides whatever the app theme is, and `.tc-root` gives the body the
 * canvas colour. Marketing body text is 16/24.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div data-theme="light" className="tc-root flex min-h-dvh flex-col bg-canvas text-body-lg text-fg">
            <MarketingHeader />
            <main id="main-content" className="flex-1 overflow-x-clip">
                {children}
            </main>
            <MarketingFooter />
        </div>
    );
}
