"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronLeft,
    MoreVertical,
    Paperclip,
    Smile,
    Mic,
    Menu,
    CheckCheck,
} from "lucide-react";

type Message = {
    id: string;
    type: "user" | "bot";
    content: React.ReactNode;
    time?: string;
};

const MESSAGES: Message[] = [
    {
        id: "msg-1",
        type: "user",
        content: "/start",
        time: "4:02 PM",
    },
    {
        id: "msg-2",
        type: "user",
        content: "Hi, how is our site doing?",
        time: "4:02 PM",
    },
    {
        id: "msg-3",
        type: "bot",
        content: (
            <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
                <p>
                    Based on the data from Google Search Console and Google Analytics,
                    here is the status for <span className="text-blue-400">yoursite.com</span>:
                </p>
                <p className="flex items-center gap-2 font-medium">
                    🚨 Critical Traffic Drop Alert
                </p>
                <p>
                    Your site is <strong>online and accessible</strong> (returning HTTP
                    200), but it has experienced a <strong>significant loss in traffic</strong>{" "}
                    starting around February 14, 2026.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>
                        <strong>Google Search Console:</strong>
                        <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-300">
                            <li><strong>Before Feb 14:</strong> ~24,000 daily impressions / ~750 daily clicks.</li>
                            <li><strong>After Feb 14:</strong> Dropped to ~600-1,000 impressions / ~60-100 clicks per day.</li>
                            <li><strong>Impact:</strong> ~90% drop in organic search visibility.</li>
                        </ul>
                    </li>
                    <li className="mt-2">
                        <strong>Google Analytics (Active Users):</strong>
                        <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-300">
                            <li><strong>Early Feb:</strong> ~1,300–1,500 daily users.</li>
                            <li><strong>Feb 14:</strong> Dropped to ~692 users.</li>
                            <li><strong>Current (Feb 18–22):</strong> Hovering around ~300–400 users/day.</li>
                            <li><strong>Conclusion:</strong> The drop in search traffic has cut your total daily users by roughly <strong>75%</strong>.</li>
                        </ul>
                    </li>
                </ul>
            </div>
        ),
    },
];

export function TelegramChatSimulation() {
    const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);

    // Simulate typing delay
    useEffect(() => {
        let timeoutIds: NodeJS.Timeout[] = [];

        const scheduleMessage = (msg: Message, delay: number) => {
            const id = setTimeout(() => {
                setVisibleMessages((prev) => [...prev, msg]);
            }, delay);
            timeoutIds.push(id);
        };

        // Stagger the messages so it looks like a real conversation
        scheduleMessage(MESSAGES[0], 500); // /start
        scheduleMessage(MESSAGES[1], 1500); // Hi
        scheduleMessage(MESSAGES[2], 3000); // Bot long response

        return () => {
            timeoutIds.forEach(clearTimeout);
        };
    }, []);

    return (
        <div className="relative mx-auto w-full max-w-[400px] aspect-[9/19] rounded-[3rem] border-[8px] border-black bg-black overflow-hidden shadow-2xl flex flex-col font-sans">
            {/* Background with subtle glow effects resembling the screenshot */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#1c1c1e] to-[#0A0A0A] z-0" />
            <div className="absolute top-1/4 left-0 w-64 h-64 bg-purple-900/20 blur-3xl z-0 rounded-full" />
            <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-blue-900/10 blur-3xl z-0 rounded-full" />

            {/* iOS Status Bar Placeholder */}
            <div className="relative z-10 flex items-center justify-between px-6 pt-3 pb-1 text-white text-xs font-medium">
                <span>1:22</span>
                <div className="flex items-center gap-1.5">
                    <div className="w-4 h-3 bg-white mask-signal" />
                    <div className="w-4 h-3 bg-white mask-wifi" />
                    <div className="w-6 h-3 bg-white mask-battery" />
                </div>
            </div>

            {/* Telegram Header */}
            <div className="relative z-10 flex items-center justify-between px-3 pb-2 pt-1 bg-[#1c1c1e]/80 backdrop-blur-md border-b border-white/5">
                <div className="flex items-center gap-3">
                    <button className="text-blue-500 p-1">
                        <span className="flex items-center">
                            <ChevronLeft size={28} />
                        </span>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white text-lg font-semibold relative overflow-hidden">
                            <span className="z-10">T</span>
                            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white font-semibold text-[15px] leading-tight flex items-center gap-1">
                                Traffic Claw
                            </span>
                            <span className="text-[#8e8e93] text-[13px] leading-tight">bot</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
                        T
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="relative z-10 flex-1 overflow-y-auto p-4 flex flex-col gap-3 nice-scrollbar">
                <div className="flex justify-center mb-2">
                    <div className="bg-white/10 backdrop-blur-md text-white/50 text-xs px-3 py-1 rounded-full font-medium">
                        February 22
                    </div>
                </div>

                <AnimatePresence>
                    {visibleMessages.map((msg, idx) => {
                        const isUser = msg.type === "user";
                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                className={`flex w-full ${isUser ? "justify-end" : "justify-start"
                                    }`}
                            >
                                <div
                                    className={`relative max-w-[85%] px-3 py-2 text-white ${isUser
                                        ? "bg-[#8041c2] rounded-2xl rounded-tr-sm"
                                        : "bg-[#212124] rounded-2xl rounded-tl-sm shadow-sm"
                                        }`}
                                >
                                    <div
                                        className={`${isUser ? "text-[15px]" : "text-[15px] text-gray-100"
                                            } whitespace-pre-wrap word-break-words`}
                                    >
                                        {msg.content}
                                    </div>

                                    <div
                                        className={`flex items-center justify-end gap-1 mt-1 ${isUser ? "text-purple-200" : "text-gray-500"
                                            } text-[10px]`}
                                    >
                                        {msg.time && <span>{msg.time}</span>}
                                        {isUser && (
                                            <CheckCheck size={14} className="text-green-400" />
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Extra space for scrolling */}
                <div className="h-4 flex-shrink-0" />
            </div>

            {/* Input Area */}
            <div className="relative z-10 bg-[#1c1c1e] p-2 flex items-center justify-between gap-2 border-t border-white/5 pb-6">
                <button className="text-white flex items-center gap-1 pl-1 shrink-0">
                    <div className="p-2.5 rounded-full bg-blue-500 flex items-center justify-center">
                        <Menu size={18} />
                        <span className="font-semibold text-sm ml-1 pr-1">Menu</span>
                    </div>
                </button>

                <div className="flex-1 flex items-center bg-[#2c2c2e] rounded-full h-[40px] px-3">
                    <Paperclip size={20} className="text-gray-400 mr-2 shrink-0" />
                    <input
                        type="text"
                        placeholder="Message"
                        className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 text-[15px]"
                        readOnly
                    />
                    <Smile size={20} className="text-gray-400 ml-2 shrink-0" />
                </div>

                <button className="text-gray-400 p-2 shrink-0">
                    <Mic size={24} />
                </button>
            </div>
        </div>
    );
}
