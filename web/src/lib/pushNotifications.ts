'use client';

const PERMISSION_KEY = 'tc-push-enabled';

export function isPushSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export function isPushEnabled(): boolean {
    if (!isPushSupported()) return false;
    return localStorage.getItem(PERMISSION_KEY) === 'true' && Notification.permission === 'granted';
}

export async function requestPushPermission(): Promise<boolean> {
    if (!isPushSupported()) return false;

    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    localStorage.setItem(PERMISSION_KEY, String(granted));
    return granted;
}

export function disablePush(): void {
    localStorage.setItem(PERMISSION_KEY, 'false');
}

export function sendBrowserNotification(title: string, body: string, options?: { tag?: string; onClick?: () => void }): void {
    if (!isPushEnabled()) return;

    try {
        const notification = new Notification(title, {
            body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: options?.tag || 'trafficclaw-alert',
            silent: false,
        });

        if (options?.onClick) {
            notification.onclick = () => {
                window.focus();
                options.onClick?.();
                notification.close();
            };
        }

        // Auto-close after 10 seconds
        setTimeout(() => notification.close(), 10000);
    } catch {
        // Notification API not available in this context
    }
}
