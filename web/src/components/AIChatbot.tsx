'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Sparkles, Loader2, Minimize2, Maximize2 } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface AIChatbotProps {
    analyticsData?: any;
    seoData?: any;
}

const QUICK_PROMPTS = [
    'Which pages have the highest bounce rate?',
    'How can I improve my SEO ranking?',
    'What are my top traffic sources?',
    'Suggest content ideas based on my data',
    'Which countries bring the most users?',
    'How is my mobile vs desktop traffic?',
];

export default function AIChatbot({ analyticsData, seoData }: AIChatbotProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: "Hi! I'm your AI SEO Advisor. I can analyze your analytics data, suggest improvements, and answer questions about your site's performance. What would you like to know?",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    const sendMessage = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    analyticsContext: analyticsData ? {
                        kpis: analyticsData.kpis,
                        topSources: analyticsData.sources?.slice(0, 5),
                        topPages: analyticsData.pages?.slice(0, 5),
                        topCountries: analyticsData.countries?.slice(0, 5),
                        devices: analyticsData.devices,
                        browsers: analyticsData.browsers?.slice(0, 5),
                        channels: analyticsData.channels?.slice(0, 5),
                    } : null,
                    seoContext: seoData ? {
                        kpis: seoData.kpis,
                        topQueries: seoData.queries?.slice(0, 5),
                        recommendations: seoData.recommendations,
                    } : null,
                    history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!res.ok) throw new Error('Failed to get response');
            const data = await res.json();

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response || 'I apologize, I could not process that request. Please try again.',
                timestamp: new Date(),
            }]);
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please make sure the GEMINI_API_KEY is configured in your environment variables, then try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-black shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all hover:scale-105 flex items-center justify-center group"
            >
                <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            </button>
        );
    }

    return (
        <div className={`fixed z-50 ${isExpanded ? 'inset-4 lg:inset-8' : 'bottom-6 right-6 w-[420px] h-[600px]'} transition-all duration-300`}>
            <div className="w-full h-full bg-[#0c0c10] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-emerald-500/[0.05] to-cyan-500/[0.05]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-black" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-white">AI SEO Advisor</h3>
                            <p className="text-[10px] text-zinc-500">Powered by Gemini</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-colors"
                        >
                            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-emerald-500/[0.15] text-emerald-100 border border-emerald-500/[0.15]'
                                    : 'bg-white/[0.04] text-zinc-300 border border-white/[0.06]'
                            }`}>
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                <div className="text-[10px] text-zinc-600 mt-1.5">
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl px-4 py-3">
                                <div className="flex items-center gap-2 text-zinc-500">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-xs">Analyzing your data...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Prompts */}
                {messages.length <= 2 && (
                    <div className="px-4 pb-2">
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.slice(0, 4).map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(prompt)}
                                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/[0.2] transition-colors"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                            placeholder="Ask about your analytics & SEO..."
                            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                            disabled={isLoading}
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={isLoading || !input.trim()}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-black flex items-center justify-center hover:opacity-90 transition disabled:opacity-30"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
