'use client';

/**
 * Tawk.to live chat, loaded only where the owner wants it (round 2, WS1):
 *
 * - the bubble shows on marketing pages and on /dashboard/support, at desktop
 *   width only (768px and up);
 * - it never shows inside the app (/dashboard/**), on share/embed/view pages,
 *   or on phones;
 * - `openLiveChat()` (the "Chat with us" button on Support) loads and opens it
 *   anywhere, also on phones; it stays while a chat is open or ongoing and
 *   hides again once it is minimised with no chat running;
 * - no auto-greeting: Tawk's greeting card (#message-preview) and the unread
 *   "1" badge stay hidden until the visitor has opened the chat once, so a
 *   greeting trigger configured in the Tawk dashboard cannot pop up by itself;
 * - in the dark app theme the black launcher gets a hairline ring so it does
 *   not melt into the near-black canvas.
 *
 * Modals, drawers and sheets hide it while open (useHideChatWidget).
 * Mounted once by <ChatWidget /> in app/providers.tsx.
 */

const TAWK_SRC = 'https://embed.tawk.to/6a065190bb83b51c35dd7459/1jokat7nr';
export const CHAT_DESKTOP_QUERY = '(min-width: 768px)';

interface TawkApi {
    onLoad?: () => void;
    onChatMaximized?: () => void;
    onChatMinimized?: () => void;
    onChatStarted?: () => void;
    onChatEnded?: () => void;
    showWidget?: () => void;
    hideWidget?: () => void;
    maximize?: () => void;
    isChatOngoing?: () => boolean;
    isChatMaximized?: () => boolean;
    customStyle?: unknown;
}

declare global {
    interface Window {
        Tawk_API?: TawkApi;
        Tawk_LoadStart?: Date;
    }
}

/** Routes with no chat bubble. Support is the one app page that has it. */
const NO_CHAT_PREFIXES = ['/dashboard', '/embed', '/share', '/view', '/admin', '/superadmin', '/oauth', '/mcp', '/preview-private', '/api'];

/** Whether the bubble may show on this route (at desktop width). */
export function chatBubbleAllowed(pathname: string): boolean {
    const p = pathname || '/';
    if (p === '/dashboard/support' || p.startsWith('/dashboard/support/')) return true;
    return !NO_CHAT_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}

const state = {
    requested: false,
    ready: false,
    /** Route + width say the bubble belongs here. */
    wanted: false,
    /** The visitor opened the chat at least once (this page load). */
    engaged: false,
    /** Open modals / drawers / sheets. */
    sheets: 0,
    /** openLiveChat() was called before the script was ready. */
    openOnReady: false,
};

function api(): TawkApi | undefined {
    return typeof window === 'undefined' ? undefined : window.Tawk_API;
}

function safe(fn: () => void) {
    try {
        fn();
    } catch {
        /* widget not ready */
    }
}

/** Show or hide the widget for the current state. */
function sync() {
    const a = api();
    if (!state.ready || !a) return;
    const chatting = Boolean(safe2(() => a.isChatMaximized?.()) || safe2(() => a.isChatOngoing?.()));
    const visible = state.sheets === 0 && (state.wanted || chatting);
    safe(() => (visible ? a.showWidget?.() : a.hideWidget?.()));
    decorate();
}

function safe2<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch {
        return undefined;
    }
}

const FRAME_STYLE_ID = 'tc-tawk-style';

/**
 * Tawk renders into same-origin about:blank iframes, so a style tag can reach
 * the launcher: hide the unread badge until the visitor engaged, and ring the
 * launcher in the dark app theme.
 */
function decorate() {
    if (typeof document === 'undefined') return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const css = [
        state.engaged ? '' : '.tawk-min-badge{display:none!important}',
        dark ? '.tawk-button{box-shadow:0 0 0 1px rgb(255 255 255 / 0.16),0 8px 24px -6px rgb(0 0 0 / 0.7)!important}' : '',
    ].join('');
    document.querySelectorAll<HTMLIFrameElement>('#min-widget iframe').forEach((frame) => {
        safe(() => {
            const doc = frame.contentDocument;
            if (!doc?.head) return;
            let tag = doc.getElementById(FRAME_STYLE_ID) as HTMLStyleElement | null;
            if (!tag) {
                tag = doc.createElement('style');
                tag.id = FRAME_STYLE_ID;
                doc.head.appendChild(tag);
            }
            if (tag.textContent !== css) tag.textContent = css;
        });
    });
}

function markEngaged() {
    state.engaged = true;
    // globals.css hides #message-preview (the greeting card) until this is set.
    document.documentElement.setAttribute('data-chat-engaged', '');
    decorate();
}

let watching = false;

function watchFrames() {
    if (watching || typeof MutationObserver === 'undefined') return;
    const root = document.getElementById('min-widget')?.parentElement;
    if (!root) return;
    watching = true;
    // Tawk swaps its iframes when the chat opens and closes (only its own
    // container is observed), and the app theme can change at any time.
    new MutationObserver(() => decorate()).observe(root, { childList: true, subtree: true });
    new MutationObserver(() => decorate()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function load() {
    if (state.requested || typeof window === 'undefined') return;
    state.requested = true;
    const a: TawkApi = (window.Tawk_API = window.Tawk_API || {});
    window.Tawk_LoadStart = new Date();
    a.customStyle = {
        visibility: {
            desktop: { position: 'br', xOffset: 20, yOffset: 20 },
            // Phones only see it when opened from Support: clear the app's bottom tab bar.
            mobile: { position: 'br', xOffset: 12, yOffset: 84 },
        },
    };
    a.onLoad = () => {
        state.ready = true;
        watchFrames();
        if (state.openOnReady) {
            state.openOnReady = false;
            markEngaged();
            safe(() => a.showWidget?.());
            safe(() => a.maximize?.());
        }
        sync();
        // The launcher iframe fills in after onLoad: decorate again once it has.
        window.setTimeout(() => { watchFrames(); decorate(); }, 400);
        window.setTimeout(() => { watchFrames(); decorate(); }, 2000);
    };
    a.onChatMaximized = () => markEngaged();
    a.onChatStarted = () => markEngaged();
    a.onChatMinimized = () => sync();
    a.onChatEnded = () => sync();
    const s = document.createElement('script');
    s.async = true;
    s.src = TAWK_SRC;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.head.appendChild(s);
}

/** Route/width changed: called by <ChatWidget />. Loads the script the first time it is wanted. */
export function setChatWanted(wanted: boolean) {
    state.wanted = wanted;
    if (wanted) load();
    sync();
}

/** "Chat with us": load if needed and open the chat window (any route, any width). */
export function openLiveChat() {
    const a = api();
    if (state.ready && a) {
        markEngaged();
        safe(() => a.showWidget?.());
        safe(() => a.maximize?.());
        return;
    }
    state.openOnReady = true;
    load();
}

/** A sheet opened (+1) or closed (-1): the bubble hides while any is open. */
export function chatSheetDelta(delta: 1 | -1) {
    state.sheets = Math.max(0, state.sheets + delta);
    sync();
}
