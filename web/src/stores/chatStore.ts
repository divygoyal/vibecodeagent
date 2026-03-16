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
