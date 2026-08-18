import { GoogleGenAI } from '@google/genai';

export const GOOGLE_GENAI_PRIMARY_MODEL = process.env.GOOGLE_GENAI_MODEL || 'gemini-3.5-flash';
export const GOOGLE_GENAI_FALLBACK_MODEL = process.env.GOOGLE_GENAI_FALLBACK_MODEL || 'gemini-3-flash-preview';
export const GOOGLE_GENAI_PLANNER_MODEL = process.env.GOOGLE_GENAI_PLANNER_MODEL || GOOGLE_GENAI_PRIMARY_MODEL;
export const GOOGLE_GENAI_LIGHT_MODEL = process.env.GOOGLE_GENAI_LIGHT_MODEL || GOOGLE_GENAI_PRIMARY_MODEL;
export const GOOGLE_GENAI_LEGACY_MODEL = process.env.GOOGLE_GENAI_LEGACY_MODEL || 'gemini-2.5-flash';
export const GOOGLE_GENAI_THINKING_DISABLED = { thinkingBudget: 0 } as const;

let cachedClient: GoogleGenAI | null | undefined;

export function getGoogleGenAIClient(): GoogleGenAI | null {
    if (cachedClient !== undefined) return cachedClient;

    const vertexApiKey = process.env.GOOGLE_VERTEX_API_KEY || process.env.VERTEX_API_KEY || '';
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT || '';
    const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_VERTEX_LOCATION || 'global';
    const forceVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

    if (vertexApiKey) {
        cachedClient = new GoogleGenAI({ vertexai: true, apiKey: vertexApiKey });
        return cachedClient;
    }

    if (forceVertex || project) {
        if (!project) {
            cachedClient = null;
            return cachedClient;
        }
        cachedClient = new GoogleGenAI({ vertexai: true, project, location });
        return cachedClient;
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    cachedClient = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
    return cachedClient;
}

export function isGoogleGenAIConfigured(): boolean {
    return getGoogleGenAIClient() !== null;
}

export function getGoogleGenAIText(response: unknown): string {
    const directText = (response as { text?: unknown })?.text;
    if (typeof directText === 'string') return directText;

    const candidates = (response as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    })?.candidates;

    return (candidates?.[0]?.content?.parts || [])
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('');
}
