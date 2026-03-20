'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Target, FileText, Wrench, ChevronRight, Check, Sparkles, ArrowRight, RotateCcw, X, ExternalLink } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';
import type { DomainOverviewData, ActionPlanItem } from '@/components/domain-overview/types';
import { generateActionPlan } from '@/components/domain-overview/types';

interface OnboardingFunnelProps {
  data: DomainOverviewData | null;
  onComplete: () => void;
  onDismiss: () => void;
}

const GOALS = [
  { id: 'traffic', label: 'Traffic Growth', icon: TrendingUp, color: 'emerald', description: 'Increase organic visitors and reduce bounce rate' },
  { id: 'ranking', label: 'Ranking Improvement', icon: Target, color: 'cyan', description: 'Climb search results for target keywords' },
  { id: 'content', label: 'Content Optimization', icon: FileText, color: 'violet', description: 'Create and optimize content that ranks' },
  { id: 'technical', label: 'Technical SEO', icon: Wrench, color: 'amber', description: 'Fix crawlability, speed, and infrastructure issues' },
];

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-500', text: 'text-red-400', headerBg: 'bg-red-500/5 border-red-500/20' },
  high: { label: 'High Impact', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-500', text: 'text-amber-400', headerBg: 'bg-amber-500/5 border-amber-500/20' },
  'quick-win': { label: 'Quick Wins', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-500', text: 'text-emerald-400', headerBg: 'bg-emerald-500/5 border-emerald-500/20' },
} as const;

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; ring: string }> = {
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-400', ring: 'ring-emerald-500/20' },
  cyan: { border: 'border-cyan-500/30', bg: 'bg-cyan-500/5', text: 'text-cyan-400', ring: 'ring-cyan-500/20' },
  violet: { border: 'border-violet-500/30', bg: 'bg-violet-500/5', text: 'text-violet-400', ring: 'ring-violet-500/20' },
  amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-400', ring: 'ring-amber-500/20' },
};

export function OnboardingFunnel({ data, onComplete, onDismiss }: OnboardingFunnelProps) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [step, setStep] = useState<2 | 3>(2);
  const [actionPlan, setActionPlan] = useState<ActionPlanItem[]>([]);
  const [completed, setCompleted] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const done = localStorage.getItem('tc-funnel-completed');
      if (done === 'true') {
        setCompleted(true);
      }
    }
  }, []);

  // Generate action plan when moving to step 3
  useEffect(() => {
    if (step === 3 && data) {
      const plan = generateActionPlan(data, selectedGoals);
      setActionPlan(plan);
    }
  }, [step, data, selectedGoals]);

  const handleGoalToggle = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId]
    );
  };

  const handleContinue = () => {
    if (selectedGoals.length > 0) {
      setStep(3);
    }
  };

  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tc-funnel-completed', 'true');
      localStorage.setItem('tc-onboarding-goals', JSON.stringify(selectedGoals));
    }
    onComplete();
  };

  // Don't render if completed or no data available yet
  if (completed || !data) return null;

  // Group action items by priority
  const groupedItems = actionPlan.reduce<Record<string, ActionPlanItem[]>>((acc, item) => {
    if (!acc[item.priority]) acc[item.priority] = [];
    acc[item.priority].push(item);
    return acc;
  }, {});

  const priorityOrder: Array<'critical' | 'high' | 'quick-win'> = ['critical', 'high', 'quick-win'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Modal content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 sm:p-6 mx-4 sm:mx-0 shadow-2xl"
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 w-10 h-10 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/5 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

      <AnimatePresence mode="wait">
        {/* Step 2: Pick Your Goals */}
        {step === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-center mb-6">
              <h3 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                What do you want to achieve?
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Select your goals and we&apos;ll create a tailored action plan
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {GOALS.map((goal) => {
                const isSelected = selectedGoals.includes(goal.id);
                const colors = COLOR_MAP[goal.color];
                const Icon = goal.icon;

                return (
                  <motion.button
                    key={goal.id}
                    onClick={() => handleGoalToggle(goal.id)}
                    whileTap={{ scale: 0.97 }}
                    animate={isSelected ? { scale: 1.02 } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`premium-card rounded-xl p-4 sm:p-5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500/50 ring-2 ring-emerald-500/20'
                        : 'hover:border-[var(--card-border-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.border} border`}>
                        <Icon className={`w-5 h-5 ${colors.text}`} />
                      </div>
                      <motion.div
                        initial={false}
                        animate={isSelected ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      >
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-black" />
                        </div>
                      </motion.div>
                    </div>
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{goal.label}</h4>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{goal.description}</p>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleContinue}
                disabled={selectedGoals.length === 0}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold px-8 py-3 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 flex items-center gap-2 w-full sm:w-auto justify-center min-h-[44px]"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Action Plan */}
        {step === 3 && (
          <motion.div
            key="step-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-center mb-6">
              <h3 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                Your Personalized SEO Action Plan
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {actionPlan.length} actions identified based on your goals and site analysis
              </p>
            </div>

            {actionPlan.length === 0 ? (
              <div className="premium-card rounded-xl p-8 text-center">
                <Sparkles className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm text-[var(--text-secondary)]">
                  No specific actions found. Your site is in good shape! Try selecting different goals.
                </p>
                <button
                  onClick={() => setStep(2)}
                  className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 mx-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Change goals
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {priorityOrder.map((priority) => {
                  const items = groupedItems[priority];
                  if (!items || items.length === 0) return null;
                  const config = PRIORITY_CONFIG[priority];

                  return (
                    <div key={priority}>
                      <div className={`${config.headerBg} border rounded-xl px-4 py-2.5 mb-3`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
                          <span className={`text-sm font-semibold ${config.text}`}>
                            {config.label}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            ({items.length} {items.length === 1 ? 'action' : 'actions'})
                          </span>
                        </div>
                      </div>
                      <div className="cascade-fade space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="premium-card rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3"
                          >
                            <div className={`w-2 h-2 rounded-full ${config.dot} mt-1.5 shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <h5 className="text-sm font-medium text-[var(--text-primary)] mb-0.5">
                                {item.title}
                              </h5>
                              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                {item.description}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {item.link ? (
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/[0.15] rounded-lg transition-all"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  View
                                </a>
                              ) : (
                                <FixWithBotButton
                                  label={item.actionLabel}
                                  context={item.actionContext}
                                  size="sm"
                                  variant="solid"
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={handleComplete}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold px-8 py-3 rounded-xl hover:opacity-90 transition-all flex items-center gap-2 w-full sm:w-auto justify-center min-h-[44px]"
              >
                Start Working
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="text-center mt-3">
              <button
                onClick={onDismiss}
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </div>
  );
}
