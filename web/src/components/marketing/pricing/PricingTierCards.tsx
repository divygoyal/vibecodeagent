'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Zap, TrendingUp, Shield, CheckCircle2, X, Sparkles } from 'lucide-react';
import GoogleAuthButton from '@/components/marketing/GoogleAuthButton';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
};

const PLANS = [
    {
        key: 'free',
        name: 'Free',
        price: '$0',
        credits: 10,
        icon: Sparkles,
        color: 'emerald',
        gradient: 'from-emerald-400 to-green-500',
        description: 'More than most tools charge for.',
        freeForever: true,
        features: [
            { text: 'Full analytics dashboard', included: true },
            { text: 'Real-time visitor globe', included: true },
            { text: 'Globe embed (with watermark)', included: true },
            { text: 'SEO tools & site audit', included: true },
            { text: 'Google Search Console', included: true },
            { text: '10 AI messages to start', included: true },
            { text: 'Remove globe watermark', included: false },
        ],
    },
    {
        key: 'starter',
        name: 'Starter',
        price: '$9',
        credits: 50,
        perMessage: '$0.18',
        icon: Zap,
        color: 'cyan',
        gradient: 'from-cyan-400 to-blue-500',
        description: 'Solo founders, side projects',
        bestFor: 'Indie maker · 1 site',
        valueProp: 'One CTR fix from this tier ≈ recovers your $9 in week one',
        productId: 'pdt_0NaLMLyWwiO355QaGlQwq',
        features: [
            { text: '50 AI credits / month', included: true },
            { text: 'Full dashboard (analytics + SEO)', included: true },
            { text: 'AEO & schema audits', included: true },
            { text: 'Site audit reports (50+ checks)', included: true },
            { text: '1 connected site', included: true },
            { text: 'Daily AI briefing', included: true },
            { text: 'Email support', included: true },
        ],
    },
    {
        key: 'growth',
        name: 'Growth',
        price: '$19',
        credits: 150,
        perMessage: '$0.13',
        icon: TrendingUp,
        color: 'emerald',
        gradient: 'from-emerald-400 to-cyan-400',
        description: 'Small businesses scaling SEO',
        bestFor: 'Founder + ops · up to 3 sites',
        valueProp: '$19/mo replaces $200/mo of analyst tools — 3× the volume of Starter for 2× the price',
        productId: 'pdt_0NaLMM1bLW9wAbmxcsebm',
        features: [
            { text: '150 AI credits / month', included: true },
            { text: 'Everything in Starter', included: true },
            { text: 'Priority AI queue (faster responses)', included: true },
            { text: 'Up to 3 connected sites', included: true },
            { text: 'Cross-source insights (Deploy ↔ Traffic)', included: true },
            { text: 'Strategic root-cause diagnoses', included: true },
            { text: 'Surprise-engine cross-source insights', included: true },
        ],
    },
    {
        key: 'pro',
        name: 'Pro',
        price: '$29',
        credits: 300,
        perMessage: '$0.10',
        icon: Shield,
        color: 'violet',
        gradient: 'from-violet-400 to-purple-500',
        description: 'Agencies, serious operators',
        bestFor: 'Multi-site · agency · power users',
        valueProp: 'Cheapest per-message tier + Telegram bot for daily mobile alerts',
        bestValue: true,
        productId: 'pdt_0NaLMM4r23kncRahthuyj',
        features: [
            { text: '300 AI credits / month', included: true },
            { text: 'Everything in Growth', included: true },
            { text: 'Telegram bot — alerts on the go', included: true },
            { text: 'Unlimited connected sites', included: true },
            { text: 'Priority support (24h response)', included: true },
            { text: 'Beta features (early access)', included: true },
            { text: 'Cheapest per-message rate ($0.10)', included: true },
        ],
    },
];

export default function PricingTierCards() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-80px' });

    return (
        <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-4 gap-5"
        >
            {PLANS.map((plan) => {
                const IconComp = plan.icon;
                return (
                    <motion.div
                        key={plan.key}
                        variants={fadeUp}
                        className={`relative flex flex-col p-6 rounded-2xl border transition-all group ${
                            plan.key === 'free'
                                ? 'bg-gradient-to-b from-emerald-500/[0.06] to-transparent border-emerald-500/20 pt-8'
                                : plan.key === 'pro'
                                ? 'bg-gradient-to-b from-violet-500/[0.06] to-transparent border-violet-500/20 pt-8'
                                : 'bg-white/[0.02] border-white/[0.06]'
                        }`}
                    >
                        {'freeForever' in plan && plan.freeForever && (
                            <span className="absolute -top-3 left-4 px-3 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[9px] font-bold text-emerald-400 uppercase tracking-wider z-10">
                                Free Forever
                            </span>
                        )}
                        {'bestValue' in plan && plan.bestValue && (
                            <span className="absolute -top-3 right-4 px-3 py-1 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 text-[10px] font-bold text-white uppercase tracking-wider shadow-lg shadow-violet-500/20 z-10">
                                Recommended
                            </span>
                        )}

                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${plan.gradient}/20`}>
                            <IconComp className={`w-5 h-5 ${
                                plan.color === 'emerald' ? 'text-emerald-400' :
                                plan.color === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                            }`} />
                        </div>

                        <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                        <p className={`text-xs text-zinc-500 ${'bestFor' in plan && plan.bestFor ? 'mb-1' : 'mb-4'}`}>{plan.description}</p>
                        {'bestFor' in plan && plan.bestFor && (
                            <p className="text-[11px] text-zinc-600 mb-4">Best for: {plan.bestFor}</p>
                        )}

                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-4xl font-bold text-white">{plan.price}</span>
                            <span className="text-sm text-zinc-500">{'freeForever' in plan ? '/forever' : '/month'}</span>
                        </div>
                        <p className={`text-xs font-medium ${'perMessage' in plan && plan.perMessage ? 'mb-1' : 'mb-6'} ${
                            plan.color === 'emerald' ? 'text-emerald-400' :
                            plan.color === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                        }`}>
                            {'freeForever' in plan ? `${plan.credits} AI credits to start` : `${plan.credits} AI credits/month`}
                        </p>
                        {'perMessage' in plan && plan.perMessage && (
                            <p className="text-[11px] text-zinc-500 mb-6">{plan.perMessage} / AI message</p>
                        )}

                        {'freeForever' in plan ? (
                            <GoogleAuthButton
                                callbackUrl="/dashboard"
                                signedInLabel="Open dashboard"
                                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold mb-6 transition-all bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer"
                            >
                                Start Free
                            </GoogleAuthButton>
                        ) : (
                            <GoogleAuthButton
                                callbackUrl="/dashboard/plan"
                                signedInLabel={`Get ${plan.name}`}
                                className={`w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold mb-6 transition-all cursor-pointer ${
                                    plan.key === 'pro'
                                        ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                                        : 'bg-white/[0.06] text-white hover:bg-white/[0.12] border border-white/[0.06]'
                                }`}
                            >
                                Get {plan.name}
                            </GoogleAuthButton>
                        )}

                        <ul className="space-y-3 flex-1">
                            {plan.features.map((f, i) => (
                                <li key={i} className={`flex items-center gap-2.5 text-sm ${f.included ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                    {f.included ? (
                                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${
                                            plan.color === 'emerald' ? 'text-emerald-400' :
                                            plan.color === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                                        }`} />
                                    ) : (
                                        <X className="w-4 h-4 flex-shrink-0 text-zinc-700" />
                                    )}
                                    {f.text}
                                </li>
                            ))}
                        </ul>
                        {'valueProp' in plan && plan.valueProp && (
                            <p className={`mt-6 pt-4 border-t border-white/[0.05] text-[11px] italic leading-relaxed ${
                                plan.color === 'emerald' ? 'text-emerald-400/90' :
                                plan.color === 'violet' ? 'text-violet-400/90' : 'text-cyan-400/90'
                            }`}>
                                {plan.valueProp}
                            </p>
                        )}
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
