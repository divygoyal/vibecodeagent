/** Copy-paste snippets for the leaderboard badge. Pure, so they can be tested. */

/** Where a badge click lands: the profile, tagged so the owner of the board can see which loop brought the visit. */
export function badgeProfileUrl(origin: string, slug: string): string {
    return `${origin}/leaderboard/${slug}?ref=badge`;
}

/** Copy-paste snippets for a badge image (HTML and Markdown), both linking to the profile with ?ref=badge. */
export function badgeSnippets(opts: { origin: string; slug: string; imgUrl: string; alt: string; height: number }): { html: string; md: string } {
    const link = badgeProfileUrl(opts.origin, opts.slug);
    return {
        html: `<a href="${link}" target="_blank" rel="noopener"><img src="${opts.imgUrl}" alt="${opts.alt}" height="${opts.height}" /></a>`,
        md: `[![${opts.alt}](${opts.imgUrl})](${link})`,
    };
}

