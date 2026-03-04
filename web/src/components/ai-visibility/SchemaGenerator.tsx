'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Loader2, Code, Sparkles } from 'lucide-react';

interface Schema {
    type: string;
    description: string;
    jsonLd: string;
}

interface SchemaGeneratorProps {
    url: string;
    onClose: () => void;
}

export default function SchemaGenerator({ url, onClose }: SchemaGeneratorProps) {
    const [schemas, setSchemas] = useState<Schema[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState<number | null>(null);

    // Fetch on mount
    useState(() => {
        fetch('/api/ai-visibility/generate-schema', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.error && !data.schemas?.length) setError(data.error);
                else setSchemas(data.schemas || []);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    });

    const handleCopy = (jsonLd: string, index: number) => {
        const scriptTag = `<script type="application/ld+json">\n${jsonLd}\n</script>`;
        navigator.clipboard.writeText(scriptTag);
        setCopied(index);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleCopyAll = () => {
        const all = schemas.map(s =>
            `<script type="application/ld+json">\n${s.jsonLd}\n</script>`
        ).join('\n\n');
        navigator.clipboard.writeText(all);
        setCopied(-1);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-[#0c0c14] border border-white/[0.1] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Code className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Schema Generator</h2>
                            <p className="text-[10px] text-zinc-500 truncate max-w-[300px]">{url}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
                            <p className="text-xs text-zinc-500">Generating optimized schemas...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-xs text-red-400">{error}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {schemas.map((schema, i) => (
                                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-3 h-3 text-amber-400" />
                                            <span className="text-[11px] font-semibold text-white">{schema.type}</span>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(schema.jsonLd, i)}
                                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-400 bg-white/[0.04] rounded-md hover:bg-white/[0.08] transition"
                                        >
                                            {copied === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            {copied === i ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <p className="px-4 py-2 text-[10px] text-zinc-400">{schema.description}</p>
                                    <pre className="px-4 py-3 text-[10px] text-emerald-300/80 bg-black/30 overflow-x-auto max-h-[200px] overflow-y-auto font-mono leading-relaxed">
                                        {schema.jsonLd}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {schemas.length > 0 && (
                    <div className="p-4 border-t border-white/[0.06] flex justify-end">
                        <button
                            onClick={handleCopyAll}
                            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium text-white bg-emerald-500/20 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition"
                        >
                            {copied === -1 ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied === -1 ? 'All Copied!' : 'Copy All Schemas'}
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
