/** JSON for a <script type="application/ld+json"> tag. `<` is escaped so owner-written text cannot close the tag. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

export function jsonLdString(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .split(LS).join('\\u2028')
        .split(PS).join('\\u2029');
}
