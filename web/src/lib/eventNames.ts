/**
 * Readable names for GA4 event names on pages a client reads (the public share page): "page_view" reads
 * "Page view". The raw name stays the key, the filter value and the hover text (round 4 polish).
 */
const KNOWN: Record<string, string> = {
    page_view: 'Page view',
    session_start: 'Session start',
    first_visit: 'First visit',
    user_engagement: 'User engagement',
    scroll: 'Scrolled 90%',
    click: 'Outbound link click',
    view_search_results: 'Site search',
    file_download: 'File download',
    form_start: 'Form started',
    form_submit: 'Form sent',
    video_start: 'Video started',
    video_progress: 'Video progress',
    video_complete: 'Video finished',
    sign_up: 'Sign-up',
    login: 'Log in',
    generate_lead: 'Lead',
    purchase: 'Purchase',
    add_to_cart: 'Add to cart',
    remove_from_cart: 'Remove from cart',
    begin_checkout: 'Checkout started',
    add_payment_info: 'Payment info added',
    add_shipping_info: 'Shipping info added',
    view_item: 'Product view',
    view_item_list: 'Product list view',
    select_item: 'Product selected',
    view_cart: 'Cart view',
    view_promotion: 'Promotion view',
    select_promotion: 'Promotion click',
    refund: 'Refund',
    share: 'Share',
    search: 'Search',
    newsletter_signup: 'Newsletter sign-up',
    cta_click: 'CTA click',
};

/** Short words kept upper case when a name is spelled out ("cta_click" -> "CTA click"). */
const ACRONYMS = new Set(['cta', 'faq', 'pdf', 'url', 'ui', 'id', 'api', 'ai', 'seo', 'sms', 'qr']);

export function eventDisplayName(name: string): string {
    const raw = name.trim();
    if (!raw) return name;
    const known = KNOWN[raw.toLowerCase()];
    if (known) return known;
    // Only snake_case / kebab-case names are spelled out; anything else ("Purchase", "(not set)") stays as is.
    if (!/^[a-z0-9]+([_-][a-z0-9]+)+$/.test(raw)) return raw;
    const words = raw.split(/[_-]/).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
    const first = words[0];
    words[0] = first === first.toUpperCase() ? first : first.charAt(0).toUpperCase() + first.slice(1);
    return words.join(' ');
}
