/** Browser side of the attribution: capture on landing, report once at sign-up. */
import { mergeFirstTouch, parseTouch, SIGNUP_SENT_KEY, touchCookieString, touchFromCookies } from './attribution';
import { clearMcpEventCookie, hasMcpEventCookie, mcpConnectedEvent, MCP_SENT_KEY, signUpEvent } from './events';

type Gtag = (command: 'event', name: string, params?: Record<string, unknown>) => void;

/** Stores the landing's ref/utm as the first touch (once). Safe to call on every page. */
export function captureFirstTouch(): void {
    if (typeof window === 'undefined') return;
    try {
        const t = parseTouch(window.location.search, { pathname: window.location.pathname, referrer: document.referrer, ownHost: window.location.hostname.replace(/^www\./, '') });
        if (!t) return;
        const existing = touchFromCookies(document.cookie);
        if (mergeFirstTouch(existing, t) !== t) return;
        document.cookie = touchCookieString(t, window.location.protocol === 'https:');
    } catch {
        // cookies blocked: attribution is best effort
    }
}

/** The GA4 sign_up event with the first touch, once per browser. Returns true when there is nothing more to do (sent now or earlier), false while the tag is missing. */
export function trackSignUp(provider?: string | null): boolean {
    if (typeof window === 'undefined') return true;
    try {
        if (window.localStorage.getItem(SIGNUP_SENT_KEY)) return true;
        const gtag = (window as unknown as { gtag?: Gtag }).gtag;
        if (typeof gtag !== 'function') return false;
        const ev = signUpEvent(touchFromCookies(document.cookie), provider);
        gtag('event', ev.name, ev.params);
        window.localStorage.setItem(SIGNUP_SENT_KEY, '1');
        return true;
    } catch {
        return true; // storage or tag blocked: nothing we can do
    }
}

/** trackSignUp, retried for up to ~10 s while the analytics tag (loaded after the page is interactive) is not there yet. Returns a cancel function. */
export function trackSignUpWhenReady(provider?: string | null): () => void {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
        if (trackSignUp(provider) || ++tries >= 10) return;
        timer = setTimeout(attempt, 1000);
    };
    attempt();
    return () => { if (timer) clearTimeout(timer); };
}

/**
 * mcp_connected, once: the consent decision route leaves the one-shot cookie after saving an approval; the first
 * dashboard page load after that sends the event and clears it. Returns true when there is nothing more to do.
 */
export function trackMcpConnected(): boolean {
    if (typeof window === 'undefined') return true;
    try {
        if (!hasMcpEventCookie(document.cookie)) return true;
        const gtag = (window as unknown as { gtag?: Gtag }).gtag;
        if (typeof gtag !== 'function') return false;
        if (!window.localStorage.getItem(MCP_SENT_KEY)) {
            const ev = mcpConnectedEvent(touchFromCookies(document.cookie));
            gtag('event', ev.name, ev.params);
            window.localStorage.setItem(MCP_SENT_KEY, '1');
        }
        document.cookie = clearMcpEventCookie();
        return true;
    } catch {
        return true;
    }
}

export function trackMcpConnectedWhenReady(): () => void {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
        if (trackMcpConnected() || ++tries >= 10) return;
        timer = setTimeout(attempt, 1000);
    };
    attempt();
    return () => { if (timer) clearTimeout(timer); };
}
