'use client';

import { signOut } from 'next-auth/react';

import { useChatStore } from '@/stores/chatStore';

/** Sign out and clear the user's local data (same cleanup as the old dashboard layout). */
export function signOutAndClear(user?: { id?: string | null; email?: string | null }) {
    useChatStore.getState().clearChat();
    const uid = user?.id || user?.email || '';
    if (uid) {
        const suffix = `:${uid}`;
        const infix = `:${uid}:`;
        const remove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.endsWith(suffix) || key.includes(infix))) remove.push(key);
        }
        remove.forEach((k) => localStorage.removeItem(k));
    }
    ['tc-last-property', 'tc-last-site', 'tc-last-range', 'tc-chat-history', 'tc-credit-usage', 'tc-last-briefing-date',
        'tc-onboarded', 'tc-welcomed', 'tc-notification-prefs', 'tc-push-enabled'].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('tc-registered');
    sessionStorage.removeItem('tc-registered-user');
    sessionStorage.removeItem('tc-dashboard-settled');
    document.cookie = 'tc_site=; Path=/; Max-Age=0; SameSite=Lax';
    void signOut({ callbackUrl: '/' });
}
