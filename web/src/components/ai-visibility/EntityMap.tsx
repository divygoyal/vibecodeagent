'use client';

import { User, Package, Hash, Building2, Cpu } from 'lucide-react';

const TYPE_CONFIG: Record<string, { icon: typeof User; color: string; bg: string }> = {
    person: { icon: User, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    product: { icon: Package, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    topic: { icon: Hash, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
    brand: { icon: Building2, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    technology: { icon: Cpu, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
};

interface Entity {
    name: string;
    type: string;
    relevance: number;
}

export default function EntityMap({ entities }: { entities: Entity[] }) {
    if (!entities.length) return null;

    // Group by type
    const grouped: Record<string, Entity[]> = {};
    for (const e of entities) {
        if (!grouped[e.type]) grouped[e.type] = [];
        grouped[e.type].push(e);
    }

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="mb-4">
                <h2 className="text-sm font-bold text-white">Entity Map</h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">Entities AI platforms associate with your domain</p>
            </div>

            <div className="space-y-3">
                {Object.entries(grouped).map(([type, items]) => {
                    const config = TYPE_CONFIG[type] || TYPE_CONFIG.topic;
                    const Icon = config.icon;

                    return (
                        <div key={type}>
                            <div className="flex items-center gap-1.5 mb-2">
                                <Icon className={`w-3 h-3 ${config.color}`} />
                                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{type}s</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {items.sort((a, b) => b.relevance - a.relevance).map((entity, i) => (
                                    <span
                                        key={i}
                                        className={`text-[10px] font-medium px-2 py-1 rounded-lg border ${config.bg} ${config.color} transition hover:scale-105`}
                                        style={{ opacity: Math.max(0.5, entity.relevance / 100) }}
                                        title={`Relevance: ${entity.relevance}%`}
                                    >
                                        {entity.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
