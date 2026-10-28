'use client';

import { Banner } from '@/components/ui/Banner';
import { Card, CardHeader } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/Switch';
import { PRIVACY_METRICS, PRIVACY_SECTIONS } from '@/lib/leaderboard/constants';
import type { PrivacyMetric, PrivacySection, PrivacySettings, VisMode } from '@/lib/leaderboard/types';

const MODES: Array<{ value: VisMode; label: string }> = [
    { value: 'exact', label: 'Exact' },
    { value: 'range', label: 'Range' },
    { value: 'hidden', label: 'Hidden' },
];

const MODE_HELP: Record<VisMode, string> = {
    exact: 'Anyone can see the number.',
    range: 'Shown as a band like 10K–50K. The chart keeps its shape but not its scale.',
    hidden: 'Not shown anywhere, and you are not ranked by it.',
};

export function PrivacyForm({ value, onChange, legacy }: { value: PrivacySettings; onChange: (next: PrivacySettings) => void; legacy: boolean }) {
    const setMetric = (key: PrivacyMetric, mode: VisMode) => onChange({ ...value, metrics: { ...value.metrics, [key]: mode } });
    const setSection = (key: PrivacySection, on: boolean) => onChange({ ...value, sections: { ...value.sections, [key]: on } });
    return (
        <div className="flex flex-col gap-4">
            {legacy ? (
                <Banner variant="info" title="Review your privacy settings">
                    This profile was created before the new privacy controls, so it still shows everything it showed before. Choose what you want public and save.
                </Banner>
            ) : null}
            <Card>
                <CardHeader title="Numbers" description="Choose, for each number, whether the public sees it exactly, as a range, or not at all." />
                <ul className="divide-y divide-border-subtle">
                    {PRIVACY_METRICS.map((m) => (
                        <li key={m.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <div className="min-w-0">
                                <p className="text-body font-medium text-fg">{m.label} <span className="ml-1 text-meta font-normal text-fg-muted">{m.source}</span></p>
                                <p className="text-body-sm text-fg-muted">{m.hint}</p>
                                <p className="mt-0.5 text-meta text-fg-muted">{MODE_HELP[value.metrics[m.key]]}</p>
                            </div>
                            <SegmentedControl ariaLabel={`${m.label} visibility`} size="sm" variant="neutral" value={value.metrics[m.key]} onChange={(v) => setMetric(m.key, v)} options={MODES} />
                        </li>
                    ))}
                </ul>
            </Card>
            <Card>
                <CardHeader title="Breakdowns" description="Off by default. Turn on only what you are happy to show." />
                <ul className="divide-y divide-border-subtle">
                    {PRIVACY_SECTIONS.map((s) => (
                        <li key={s.key} className="py-3">
                            <Switch checked={value.sections[s.key]} onCheckedChange={(v) => setSection(s.key, v)} label={s.label} description={s.hint} />
                        </li>
                    ))}
                </ul>
            </Card>
            <Card>
                <CardHeader title="Live" />
                <Switch
                    checked={value.live}
                    onCheckedChange={(v) => onChange({ ...value, live: v })}
                    label="Show a live visitor count"
                    description="Adds “N online now” (GA4 realtime active users, refreshed at most once a minute) to your profile, badge and widget."
                />
            </Card>
        </div>
    );
}
