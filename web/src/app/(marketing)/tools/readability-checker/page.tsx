'use client';

import { useState, FormEvent, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { BookOpen, ArrowLeft, Search, Type, Link2 } from 'lucide-react';

interface ReadabilityResult {
    score: number;
    gradeLevel: number;
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: number;
    avgSyllablesPerWord: number;
    rating: string;
    recommendations: string[];
}

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

function countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    let count = 0;
    const vowels = 'aeiouy';
    let prevVowel = false;
    for (let i = 0; i < word.length; i++) {
        const isVowel = vowels.includes(word[i]);
        if (isVowel && !prevVowel) count++;
        prevVowel = isVowel;
    }
    if (word.endsWith('e') && count > 1) count--;
    return Math.max(count, 1);
}

function computeReadability(text: string): ReadabilityResult {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const wordCount = words.length;
    const sentenceCount = Math.max(sentences.length, 1);
    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = wordCount > 0 ? totalSyllables / wordCount : 0;

    const score = Math.max(0, Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord));
    const gradeLevel = Math.max(0, 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59);

    let rating: string;
    if (score >= 90) rating = 'Very Easy';
    else if (score >= 80) rating = 'Easy';
    else if (score >= 70) rating = 'Fairly Easy';
    else if (score >= 60) rating = 'Standard';
    else if (score >= 50) rating = 'Fairly Difficult';
    else if (score >= 30) rating = 'Difficult';
    else rating = 'Very Difficult';

    const recommendations: string[] = [];
    if (avgWordsPerSentence > 20) recommendations.push('Shorten your sentences. Aim for 15-20 words per sentence on average.');
    if (avgSyllablesPerWord > 1.6) recommendations.push('Use simpler words. Replace multi-syllable words with shorter alternatives.');
    if (score < 60) recommendations.push('Break up long paragraphs into shorter, more digestible chunks.');
    if (score < 50) recommendations.push('Consider using bullet points or numbered lists to improve scanability.');
    if (score >= 80) recommendations.push('Great readability! Your content is accessible to a wide audience.');
    if (wordCount < 100) recommendations.push('Your text is quite short. Longer content tends to perform better for SEO.');
    if (wordCount > 2000) recommendations.push('Consider adding a table of contents for easier navigation.');

    return {
        score: Math.round(score * 10) / 10,
        gradeLevel: Math.round(gradeLevel * 10) / 10,
        wordCount,
        sentenceCount,
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
        rating,
        recommendations,
    };
}

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (Math.min(score, 100) / 100) * circumference;

    let color: string;
    if (score >= 70) color = '#34d399';
    else if (score >= 50) color = '#fbbf24';
    else color = '#f87171';

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold" style={{ color }}>{Math.round(score)}</span>
                <span className="text-xs text-zinc-500">/ 100</span>
            </div>
        </div>
    );
}

function Shimmer() {
    return (
        <div className="space-y-4 animate-pulse">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-white/[0.04]" />
            ))}
        </div>
    );
}

export default function ReadabilityCheckerPage() {
    const [mode, setMode] = useState<'url' | 'text'>('url');
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ReadabilityResult | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setResult(null);

        if (mode === 'text') {
            if (!text.trim()) return;
            const computed = computeReadability(text);
            setResult(computed);
            return;
        }

        if (!url.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/tools?tool=readability&url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to analyze');
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const ratingColor = useMemo(() => {
        if (!result) return '';
        if (result.score >= 70) return 'text-emerald-400';
        if (result.score >= 50) return 'text-amber-400';
        return 'text-red-400';
    }, [result]);

    return (
        <div className="min-h-screen pt-24 pb-20 px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> All Tools
                </Link>

                <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                            <BookOpen className="w-5 h-5" />
                        </div>
                        <h1 className="text-3xl font-bold">Readability Checker</h1>
                    </div>
                    <p className="text-zinc-400 mb-8">
                        Analyze content readability using the Flesch-Kincaid scoring system.
                    </p>
                </motion.div>

                {/* Input */}
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-8">
                    {/* Tab toggle */}
                    <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] w-fit mb-5">
                        <button
                            onClick={() => setMode('url')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${mode === 'url' ? 'bg-white/[0.1] text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Link2 className="w-3.5 h-3.5" /> URL
                        </button>
                        <button
                            onClick={() => setMode('text')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${mode === 'text' ? 'bg-white/[0.1] text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Type className="w-3.5 h-3.5" /> Paste Text
                        </button>
                    </div>

                    <form onSubmit={handleSubmit}>
                        {mode === 'url' ? (
                            <div className="flex gap-3">
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://example.com/blog-post"
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !url.trim()}
                                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Search className="w-4 h-4" /> Analyze
                                </button>
                            </div>
                        ) : (
                            <>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Paste your content here..."
                                    rows={6}
                                    className="w-full px-4 py-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors resize-y"
                                />
                                <button
                                    type="submit"
                                    disabled={!text.trim()}
                                    className="mt-3 px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Search className="w-4 h-4" /> Analyze
                                </button>
                            </>
                        )}
                    </form>
                </motion.div>

                {loading && <Shimmer />}

                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {result && (
                    <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="space-y-6">
                        {/* Score + Rating */}
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <ScoreRing score={result.score} />
                                <div className="text-center sm:text-left">
                                    <p className={`text-2xl font-bold ${ratingColor}`}>{result.rating}</p>
                                    <p className="text-sm text-zinc-400 mt-1">
                                        Grade Level: <span className="text-white font-medium">{result.gradeLevel}</span>
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        {/* Stats */}
                        <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Words', value: result.wordCount.toLocaleString() },
                                { label: 'Sentences', value: result.sentenceCount.toLocaleString() },
                                { label: 'Avg Words/Sentence', value: result.avgWordsPerSentence },
                                { label: 'Avg Syllables/Word', value: result.avgSyllablesPerWord },
                            ].map((stat) => (
                                <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                                    <p className="text-xl font-bold text-white">{stat.value}</p>
                                    <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
                                </div>
                            ))}
                        </motion.div>

                        {/* Recommendations */}
                        {result.recommendations.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                                <h2 className="text-lg font-semibold mb-3">Recommendations</h2>
                                <ul className="space-y-2">
                                    {result.recommendations.map((rec, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                            {rec}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
