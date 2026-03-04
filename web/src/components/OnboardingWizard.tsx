'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, BarChart3, Search, Radar, MessageSquare, ScanSearch,
    ArrowRight, Check, Sparkles, Loader2, X, Globe
} from 'lucide-react';
import { useContainerStatus, useSiteList, usePropertyList } from '@/lib/useDashboardData';

interface OnboardingWizardProps {
    onComplete: () => void;
    onSelectSite: (site: string) => void;
    onSelectProperty: (property: string) => void;
}

const FEATURES = [
    { icon: BarChart3, label: 'Analytics', desc: 'Real-time traffic & visitor insights from GA4', color: 'blue' },
    { icon: Search, label: 'SEO', desc: 'Keyword rankings & search performance from GSC', color: 'emerald' },
    { icon: Radar, label: 'Intelligence', desc: 'Smart alerts & proactive anomaly detection', color: 'amber' },
    { icon: MessageSquare, label: 'AI Chat', desc: 'Ask anything about your data — AI does the analysis', color: 'purple' },
    { icon: ScanSearch, label: 'Audit', desc: 'Page speed, Core Web Vitals & SEO audits', color: 'cyan' },
];

const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/20 text-blue-400',
    emerald: 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-600/20 border-amber-500/20 text-amber-400',
    purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/20 text-purple-400',
    cyan: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/20 text-cyan-400',
};

export default function OnboardingWizard({ onComplete, onSelectSite, onSelectProperty }: OnboardingWizardProps) {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const [step, setStep] = useState(0); // 0=welcome, 1=connect, 2=site, 3=property, 4=tour
    const [selectedSite, setSelectedSite] = useState('');
    const [selectedProp, setSelectedProp] = useState('');
    const [waitingForGoogle, setWaitingForGoogle] = useState(false);

    // Auto-advance from Connect step when Google is connected
    useEffect(() => {
        if (step === 1 && hasGoogleConnection && !containerLoading) {
            setWaitingForGoogle(false);
            setStep(2);
        }
    }, [step, hasGoogleConnection, containerLoading]);

    // Auto-advance from site step if only 1 site
    useEffect(() => {
        if (step === 2 && sites.length === 1 && !selectedSite) {
            setSelectedSite(sites[0].siteUrl || sites[0]);
        }
    }, [step, sites, selectedSite]);

    // Auto-advance from property step if only 1 property
    useEffect(() => {
        if (step === 3 && properties.length === 1 && !selectedProp) {
            setSelectedProp(properties[0].property || properties[0]);
        }
    }, [step, properties, selectedProp]);

    // Skip connect step if already connected
    const goToNextFromWelcome = () => {
        if (hasGoogleConnection) {
            setStep(sites.length > 0 ? 2 : 4);
        } else {
            setStep(1);
        }
    };

    const handleSiteConfirm = () => {
        if (selectedSite) onSelectSite(selectedSite);
        if (properties.length > 0) {
            setStep(3);
        } else {
            setStep(4);
        }
    };

    const handlePropertyConfirm = () => {
        if (selectedProp) onSelectProperty(selectedProp);
        setStep(4);
    };

    const handleFinish = () => {
        localStorage.setItem('tc-onboarded', 'true');
        onComplete();
    };

    const stepIndicators = hasGoogleConnection
        ? ['Welcome', 'Site', 'Property', 'Tour']
        : ['Welcome', 'Connect', 'Site', 'Property', 'Tour'];

    const mappedStep = hasGoogleConnection
        ? (step === 0 ? 0 : step === 2 ? 1 : step === 3 ? 2 : 3)
        : step;

    return (
        <div className="fixed inset-0 z-[100] bg-[#09090b] flex items-center justify-center">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/[0.03] rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/[0.03] rounded-full blur-3xl" />
            </div>

            {/* Skip button */}
            <button
                onClick={handleFinish}
                className="absolute top-6 right-6 text-zinc-600 hover:text-zinc-400 transition text-sm flex items-center gap-1.5 z-10"
            >
                Skip <X className="w-3.5 h-3.5" />
            </button>

            {/* Step indicators */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                {stepIndicators.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            i < mappedStep
                                ? 'bg-emerald-500 text-black'
                                : i === mappedStep
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-white/[0.04] text-zinc-600 border border-white/[0.06]'
                        }`}>
                            {i < mappedStep ? <Check className="w-3 h-3" /> : i + 1}
                        </div>
                        {i < stepIndicators.length - 1 && (
                            <div className={`w-8 h-px ${i < mappedStep ? 'bg-emerald-500/50' : 'bg-white/[0.06]'}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Content area */}
            <div className="relative w-full max-w-lg px-6">
                <AnimatePresence mode="wait">
                    {/* Step 0: Welcome */}
                    {step === 0 && (
                        <motion.div
                            key="welcome"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center"
                        >
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                                <Zap className="w-10 h-10 text-black" strokeWidth={2.5} />
                            </div>
                            <h1 className="text-3xl font-bold text-white mb-3">
                                Welcome to Traffic<span className="text-emerald-400">Claw</span>
                            </h1>
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto mb-8">
                                Your AI-powered SEO & analytics command center. Let&apos;s get you set up in under a minute.
                            </p>
                            <button
                                onClick={goToNextFromWelcome}
                                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm shadow-lg shadow-emerald-500/20"
                            >
                                Get Started <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}

                    {/* Step 1: Connect Google */}
                    {step === 1 && (
                        <motion.div
                            key="connect"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
                                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Connect Google</h2>
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto mb-6">
                                Link your Google account to pull in Analytics and Search Console data automatically. We only request read-only access.
                            </p>
                            <div className="flex items-center justify-center gap-6 mb-8">
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                    <BarChart3 className="w-3 h-3 text-blue-400" />
                                    <span>GA4 Analytics</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                    <Search className="w-3 h-3 text-emerald-400" />
                                    <span>Search Console</span>
                                </div>
                            </div>
                            {waitingForGoogle ? (
                                <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Waiting for Google connection...
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setWaitingForGoogle(true); signIn('google'); }}
                                    className="inline-flex items-center gap-2.5 px-8 py-3 bg-white text-[#1a1a2e] font-semibold rounded-xl hover:bg-zinc-100 transition-all text-sm shadow-lg shadow-white/10"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Connect Google Account
                                </button>
                            )}
                            <button
                                onClick={() => setStep(4)}
                                className="block mx-auto mt-4 text-[11px] text-zinc-600 hover:text-zinc-400 transition"
                            >
                                Skip for now
                            </button>
                        </motion.div>
                    )}

                    {/* Step 2: Select Site */}
                    {step === 2 && (
                        <motion.div
                            key="site"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                                <Search className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Select Your Site</h2>
                            <p className="text-zinc-400 text-sm mb-6">Choose the Search Console property you want to monitor.</p>

                            {sitesLoading ? (
                                <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-4">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Loading sites...
                                </div>
                            ) : sites.length === 0 ? (
                                <div className="text-sm text-zinc-500 py-4">
                                    No Search Console sites found. You can add one at{' '}
                                    <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google Search Console</a>.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[240px] overflow-y-auto mb-6 text-left">
                                    {sites.map((site: any) => {
                                        const url = site.siteUrl || site;
                                        const isSelected = selectedSite === url;
                                        return (
                                            <button
                                                key={url}
                                                onClick={() => setSelectedSite(url)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                                    isSelected
                                                        ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-white'
                                                        : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-white'
                                                }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                    isSelected ? 'bg-emerald-500/20' : 'bg-white/[0.04]'
                                                }`}>
                                                    <Globe className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-medium truncate">{url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '')}</span>
                                                {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-auto flex-shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <button
                                onClick={handleSiteConfirm}
                                disabled={!selectedSite && sites.length > 0}
                                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Continue <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}

                    {/* Step 3: Select Property */}
                    {step === 3 && (
                        <motion.div
                            key="property"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
                                <BarChart3 className="w-7 h-7 text-blue-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Select Analytics Property</h2>
                            <p className="text-zinc-400 text-sm mb-6">Choose the GA4 property to connect for traffic data.</p>

                            {propsLoading ? (
                                <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-4">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Loading properties...
                                </div>
                            ) : properties.length === 0 ? (
                                <div className="text-sm text-zinc-500 py-4">No GA4 properties found.</div>
                            ) : (
                                <div className="space-y-2 max-h-[240px] overflow-y-auto mb-6 text-left">
                                    {properties.map((prop: any) => {
                                        const id = prop.property || prop;
                                        const isSelected = selectedProp === id;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => setSelectedProp(id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                                    isSelected
                                                        ? 'bg-blue-500/[0.08] border-blue-500/30 text-white'
                                                        : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-white'
                                                }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                    isSelected ? 'bg-blue-500/20' : 'bg-white/[0.04]'
                                                }`}>
                                                    <BarChart3 className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-medium truncate">{prop.displayName || id}</span>
                                                {isSelected && <Check className="w-4 h-4 text-blue-400 ml-auto flex-shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <button
                                onClick={handlePropertyConfirm}
                                disabled={!selectedProp && properties.length > 0}
                                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Continue <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}

                    {/* Step 4: Feature Tour */}
                    {step === 4 && (
                        <motion.div
                            key="tour"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                                <Sparkles className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
                            <p className="text-zinc-400 text-sm mb-8">Here&apos;s what you can do with TrafficClaw:</p>

                            <div className="space-y-3 mb-8 text-left">
                                {FEATURES.map((f, i) => (
                                    <motion.div
                                        key={f.label}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.08 }}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                                    >
                                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br border flex items-center justify-center flex-shrink-0 ${colorMap[f.color]}`}>
                                            <f.icon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-white">{f.label}</div>
                                            <div className="text-[11px] text-zinc-500">{f.desc}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <button
                                onClick={handleFinish}
                                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm shadow-lg shadow-emerald-500/20"
                            >
                                Go to Dashboard <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

