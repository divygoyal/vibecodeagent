import { create } from 'zustand';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string; // ISO string for serialization
    tools?: { name: string; args: any; result?: string; structuredData?: any }[];
    hasError?: boolean;
}

const BASE_STORAGE_KEY = 'tc-chat-history';
const MAX_MESSAGES = 30; // ~10 Q&A pairs + some buffer

// Current user ID for scoping — set via setCurrentUser()
let currentUserId = '';

function getStorageKey(): string {
    return currentUserId ? `${BASE_STORAGE_KEY}:${currentUserId}` : BASE_STORAGE_KEY;
}

/* ─────────────────────────────────────────────────────────────────────
 * Phase B-1: Server-side sync (additive — localStorage stays primary)
 *
 *   localStorage  =  fast read path on chat open (instant)
 *   server        =  source of truth, survives cache clear, cross-device
 *
 * We sync threads + messages best-effort. Failures don't break the chat —
 * they just mean this turn isn't durable until the next one succeeds.
 * The chat thread id is generated client-side and reused across turns of
 * a single conversation; clearing the chat starts a new thread.
 * ────────────────────────────────────────────────────────────────────── */

const THREAD_ID_KEY = 'tc-chat-thread-id';

function generateThreadId(): string {
    // Crypto-grade UUID (browsers >= Chrome 92 / Firefox 95 / Safari 15.4).
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        try { return (crypto as any).randomUUID(); } catch { /* fallthrough */ }
    }
    // Fallback: timestamp + 16 hex bytes.
    const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    return `${Date.now().toString(36)}-${rand}`;
}

export function getOrCreateThreadId(): string {
    if (typeof window === 'undefined') return '';
    try {
        const existing = localStorage.getItem(`${THREAD_ID_KEY}:${currentUserId}`);
        if (existing) return existing;
        const fresh = generateThreadId();
        localStorage.setItem(`${THREAD_ID_KEY}:${currentUserId}`, fresh);
        return fresh;
    } catch {
        return generateThreadId();
    }
}

export function resetThreadId(): string {
    if (typeof window !== 'undefined') {
        try { localStorage.removeItem(`${THREAD_ID_KEY}:${currentUserId}`); } catch { /* skip */ }
    }
    threadEnsuredFor = null;
    return getOrCreateThreadId();
}

/** Switch the active thread (used by the sidebar when the user picks a past
 *  conversation). Resets the ensure-on-server cache so a stale create call
 *  isn't skipped if we land on a thread we haven't synced yet this session. */
export function setActiveThreadId(id: string): void {
    if (typeof window === 'undefined' || !id) return;
    try { localStorage.setItem(`${THREAD_ID_KEY}:${currentUserId}`, id); } catch { /* skip */ }
    threadEnsuredFor = id; // already exists on server (we're loading from it), no need to re-create
}

let threadEnsuredFor: string | null = null;
async function ensureThreadOnServer(threadId: string, opts: { title?: string; persona?: string; site_url?: string; repo?: string } = {}): Promise<void> {
    if (threadEnsuredFor === threadId) return;
    threadEnsuredFor = threadId;
    try {
        await fetch(`/api/chat-store?action=create_thread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: threadId, ...opts }),
        });
    } catch { /* server-sync is best-effort */ }
}

export interface PersistMessageOpts {
    role: 'user' | 'assistant';
    content: string;
    tools?: ChatMessage['tools'];
    intent?: string;
    model?: string;
    latency_ms?: number;
}

/**
 * Fire-and-forget: persist a single turn to the server. Called by AIChatbot
 * after a user sends and after an assistant message finishes streaming.
 */
export async function persistMessage(opts: PersistMessageOpts, threadOpts?: { title?: string; site_url?: string; repo?: string }): Promise<void> {
    if (typeof window === 'undefined') return;
    const threadId = getOrCreateThreadId();
    await ensureThreadOnServer(threadId, threadOpts);
    try {
        await fetch(`/api/chat-store?action=append_message&thread=${encodeURIComponent(threadId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: opts.role,
                content: opts.content,
                tools_json: opts.tools && opts.tools.length ? JSON.stringify(opts.tools) : null,
                model: opts.model,
                intent: opts.intent,
                latency_ms: opts.latency_ms,
            }),
        });
    } catch { /* server-sync is best-effort */ }
}

function loadFromStorage(): ChatMessage[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(getStorageKey());
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch { /* corrupted */ }
    return [];
}

function saveToStorage(messages: ChatMessage[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch (err) {
        // localStorage may be full (QuotaExceededError) — try saving fewer messages
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            try {
                // Keep only last 10 messages as emergency fallback
                localStorage.setItem(getStorageKey(), JSON.stringify(messages.slice(-10)));
            } catch {
                // Storage completely full — clear old chat data to free space
                try { localStorage.removeItem(getStorageKey()); } catch { /* truly broken */ }
            }
        }
    }
}

interface ChatStore {
    messages: ChatMessage[];
    setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    addMessage: (msg: ChatMessage) => void;
    updateLastAssistant: (updater: (msg: ChatMessage) => ChatMessage) => void;
    clearChat: () => void;
    setCurrentUser: (userId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
    messages: loadFromStorage(),

    setMessages: (updater) => {
        set((state) => {
            const next = typeof updater === 'function' ? updater(state.messages) : updater;
            saveToStorage(next);
            return { messages: next };
        });
    },

    addMessage: (msg) => {
        set((state) => {
            const next = [...state.messages, msg];
            saveToStorage(next);
            return { messages: next };
        });
    },

    updateLastAssistant: (updater) => {
        set((state) => {
            const msgs = [...state.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
                msgs[lastIdx] = updater(msgs[lastIdx]);
            }
            saveToStorage(msgs);
            return { messages: msgs };
        });
    },

    clearChat: () => {
        // Clear both current scoped key and legacy unscoped key
        if (typeof window !== 'undefined') {
            localStorage.removeItem(getStorageKey());
            localStorage.removeItem(BASE_STORAGE_KEY);
        }
        // B-1: rotate thread id so next message starts a fresh server-side thread
        threadEnsuredFor = null;
        resetThreadId();
        set({ messages: [] });
    },

    // Call this when user session is available to load the correct chat history
    setCurrentUser: (userId: string) => {
        if (currentUserId === userId) return; // No change
        currentUserId = userId;
        // Reload messages for the new user
        const messages = loadFromStorage();
        set({ messages });
    },
}));
