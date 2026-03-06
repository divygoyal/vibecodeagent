import { create } from 'zustand';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string; // ISO string for serialization
    tools?: { name: string; args: any; result?: string; structuredData?: any }[];
    hasError?: boolean;
}

const STORAGE_KEY = 'tc-chat-history';
const MAX_MESSAGES = 30; // ~10 Q&A pairs + some buffer

function loadFromStorage(): ChatMessage[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch { /* full */ }
}

interface ChatStore {
    messages: ChatMessage[];
    setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    addMessage: (msg: ChatMessage) => void;
    updateLastAssistant: (updater: (msg: ChatMessage) => ChatMessage) => void;
    clearChat: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
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
        saveToStorage([]);
        set({ messages: [] });
    },
}));
