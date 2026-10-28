/**
 * Embeds tell the host page how tall they are so it can size the iframe: { type: 'tc:dimensions', height }.
 * The embed snippet in the dashboard Share dialog listens for the same message.
 */

export const EMBED_RESIZE_TYPE = 'tc:dimensions';

export type EmbedDimensionsMessage = { type: typeof EMBED_RESIZE_TYPE; height: number };

/** The message for a measured height (whole pixels, never negative). */
export function dimensionsMessage(height: number): EmbedDimensionsMessage {
    return { type: EMBED_RESIZE_TYPE, height: Math.max(0, Math.ceil(height)) };
}

type Observed = { getBoundingClientRect(): { height: number } };
type ObserverCtor = new (cb: () => void) => { observe(el: unknown): void; disconnect(): void };

/**
 * Posts the height of `el` to the parent window now and whenever it changes (ResizeObserver). A height that did not
 * change is not re-sent. Does nothing outside an iframe. Returns the cleanup.
 */
export function watchEmbedHeight(el: Observed, win: { parent: { postMessage(m: unknown, target: string): void }; ResizeObserver?: ObserverCtor } & object, self: unknown = win): () => void {
    if (win.parent === self) return () => undefined;
    let last = -1;
    const post = () => {
        const msg = dimensionsMessage(el.getBoundingClientRect().height);
        if (msg.height === last) return;
        last = msg.height;
        win.parent.postMessage(msg, '*');
    };
    const RO = win.ResizeObserver;
    const ro = RO ? new RO(post) : null;
    ro?.observe(el);
    post();
    return () => ro?.disconnect();
}
