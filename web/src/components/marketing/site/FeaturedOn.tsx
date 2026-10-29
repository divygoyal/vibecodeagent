import { FeaturedBadge } from './FeaturedBadge';
import { FEATURED_ON, type FeaturedListing } from './featuredOn';

function Listing({ item, hidden }: { item: FeaturedListing; hidden?: boolean }) {
    return (
        <a
            href={item.href}
            target="_blank"
            rel="noopener"
            title={item.name}
            tabIndex={hidden ? -1 : undefined}
            className="flex h-10 shrink-0 items-center rounded-control opacity-80 transition-opacity duration-120 hover:opacity-100"
        >
            <FeaturedBadge name={item.name} src={item.badge} decorative={hidden} />
        </a>
    );
}

/** "Featured on": the directories that list us, kept in the footer so their listings and backlinks stay live. */
export function FeaturedOn() {
    return (
        <section aria-labelledby="featured-on" className="mt-12 border-t border-border-subtle pt-8">
            <h2 id="featured-on" className="text-meta font-medium uppercase tracking-[0.16em] text-fg-muted">
                Featured on {FEATURED_ON.length} directories
            </h2>
            <div className="group relative mt-4 overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]">
                {/* Two copies make a seamless loop; hover or keyboard focus pauses it, reduced motion scrolls instead. */}
                <div className="flex w-max animate-marquee items-center gap-5 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] motion-reduce:animate-none">
                    <ul className="flex shrink-0 items-center gap-5">
                        {FEATURED_ON.map((item) => <li key={item.href}><Listing item={item} /></li>)}
                    </ul>
                    <ul aria-hidden className="flex shrink-0 items-center gap-5 motion-reduce:hidden">
                        {FEATURED_ON.map((item) => <li key={item.href}><Listing item={item} hidden /></li>)}
                    </ul>
                </div>
            </div>
        </section>
    );
}
