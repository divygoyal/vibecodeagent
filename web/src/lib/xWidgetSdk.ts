export type TwttrSdk = {
    widgets: {
        createTweet: (
            id: string,
            el: HTMLElement,
            opts: Record<string, string>,
        ) => Promise<HTMLElement | undefined>;
    };
};

type WindowWithTwitter = Window & typeof globalThis & {
    twttr?: TwttrSdk;
};

const TWITTER_ORIGINS = [
    'https://platform.twitter.com',
    'https://syndication.twitter.com',
    'https://pbs.twimg.com',
];

let twitterSdkPromise: Promise<TwttrSdk> | null = null;

export function ensureTwitterSdk(): Promise<TwttrSdk> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Twitter widgets can only load in the browser'));
    }

    const browserWindow = window as WindowWithTwitter;
    if (browserWindow.twttr?.widgets?.createTweet) {
        return Promise.resolve(browserWindow.twttr);
    }

    if (twitterSdkPromise) {
        return twitterSdkPromise;
    }

    TWITTER_ORIGINS.forEach((origin) => {
        if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = origin;
            document.head.appendChild(link);
        }
    });

    twitterSdkPromise = new Promise<TwttrSdk>((resolve, reject) => {
        const resolveWhenReady = () => {
            if (browserWindow.twttr?.widgets?.createTweet) {
                resolve(browserWindow.twttr);
                return true;
            }
            return false;
        };

        if (resolveWhenReady()) {
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>('script[src*="platform.twitter.com/widgets.js"]');
        const script =
            existingScript ||
            (() => {
                const element = document.createElement('script');
                element.src = 'https://platform.twitter.com/widgets.js';
                element.async = true;
                element.charset = 'utf-8';
                document.head.appendChild(element);
                return element;
            })();

        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        const stopPolling = () => {
            if (pollTimer) clearTimeout(pollTimer);
        };

        const poll = (attemptsLeft: number) => {
            if (resolveWhenReady()) {
                stopPolling();
                return;
            }
            if (attemptsLeft <= 0) {
                stopPolling();
                twitterSdkPromise = null;
                reject(new Error('Twitter widgets failed to initialize'));
                return;
            }
            pollTimer = setTimeout(() => poll(attemptsLeft - 1), 100);
        };

        script.addEventListener(
            'error',
            () => {
                stopPolling();
                twitterSdkPromise = null;
                reject(new Error('Twitter widgets failed to load'));
            },
            { once: true },
        );

        if (existingScript) {
            poll(40);
            return;
        }

        script.addEventListener(
            'load',
            () => {
                poll(40);
            },
            { once: true },
        );
    });

    return twitterSdkPromise;
}
