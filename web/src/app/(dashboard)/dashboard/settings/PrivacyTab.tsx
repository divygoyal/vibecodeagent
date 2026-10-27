'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Download, ExternalLink, FileText, ShieldAlert } from 'lucide-react';

import { SettingsRow, SettingsSection } from '@/components/app/SettingsSection';
import { Button } from '@/components/ui/Button';
import { buildAccountExport, downloadJson } from './exportData';

const KEPT = [
    'Your sign-in details: name, email and profile photo.',
    'Encrypted Google access tokens, so we can read Search Console and Analytics for you.',
    'Which sites you picked, your dashboards, annotations and public links.',
    'Your Ask conversations and the facts Ask remembers about your sites.',
    'Your plan, message balance and support messages.',
];

/** Data and privacy (DESIGN 5.14): export what we hold, what we keep, and the way to delete it. */
export function PrivacyTab({ goToDanger }: { goToDanger: () => void }) {
    const { data: session } = useSession();
    const [exporting, setExporting] = useState(false);

    const exportAll = async () => {
        setExporting(true);
        try {
            const { file, missing } = await buildAccountExport({ name: session?.user?.name, email: session?.user?.email });
            const day = new Date().toISOString().slice(0, 10);
            downloadJson(file, `trafficclaw-export-${day}.json`);
            if (missing.length) toast.warning(`Exported, but could not include: ${missing.join(', ')}.`);
            else toast.success('Your data was exported.');
        } catch {
            toast.error('Could not export your data. Try again.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <>
            <SettingsSection title="Export your data" description="A JSON file with everything TrafficClaw keeps about you. Your Google data stays in Google.">
                <Button variant="secondary" icon={Download} loading={exporting} onClick={() => void exportAll()}>Export my data</Button>
            </SettingsSection>

            <SettingsSection title="What we keep" description="Only what the features you use need.">
                <ul className="flex flex-col gap-2">
                    {KEPT.map((k) => (
                        <li key={k} className="flex items-start gap-2.5 text-body text-fg-secondary">
                            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-faint" />
                            {k}
                        </li>
                    ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm">
                    <Link href="/privacy" className="inline-flex items-center gap-1.5 text-brand-text underline underline-offset-2">
                        <FileText aria-hidden size={14} />Privacy policy
                    </Link>
                    <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand-text underline underline-offset-2">
                        Google account permissions<ExternalLink aria-hidden size={14} />
                    </a>
                </div>
            </SettingsSection>

            <SettingsSection title="Delete your account" description="Removes your account and the data above.">
                <SettingsRow
                    title="Ask us to delete everything"
                    description="You confirm in the Danger zone. We then delete your account and all its data."
                    control={<Button variant="secondary" icon={ShieldAlert} onClick={goToDanger}>Go to danger zone</Button>}
                />
            </SettingsSection>
        </>
    );
}
