'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

import { SettingsRow, SettingsSection } from '@/components/app/SettingsSection';
import { Switch } from '@/components/ui/Switch';
import { useLocalStorageString } from '@/lib/useLocalStorage';
import { disablePush, isPushEnabled, isPushSupported, requestPushPermission } from '@/lib/pushNotifications';

type Prefs = { seoAlerts: boolean; weeklyReport: boolean; contentDecay: boolean };
const DEFAULT_PREFS: Prefs = { seoAlerts: true, weeklyReport: true, contentDecay: true };
const STORAGE_KEY = 'tc-notification-prefs';

/**
 * Notifications and alerts (DESIGN 5.14). Switches apply instantly. The
 * preferences are stored in this browser (same key as before); the old
 * "bot errors" switch is gone with the Telegram bot.
 */
export function NotificationsTab() {
    const [stored, store] = useLocalStorageString(STORAGE_KEY);
    // Parsed from the stored string; null (server and hydration) renders the defaults.
    const prefs = useMemo<Prefs>(() => {
        if (!stored) return DEFAULT_PREFS;
        try {
            const parsed = JSON.parse(stored) as Partial<Prefs>;
            return {
                seoAlerts: parsed.seoAlerts ?? DEFAULT_PREFS.seoAlerts,
                weeklyReport: parsed.weeklyReport ?? DEFAULT_PREFS.weeklyReport,
                contentDecay: parsed.contentDecay ?? DEFAULT_PREFS.contentDecay,
            };
        } catch {
            return DEFAULT_PREFS;
        }
    }, [stored]);

    const toggle = (key: keyof Prefs, value: boolean) => store(JSON.stringify({ ...prefs, [key]: value }));

    return (
        <>
            <SettingsSection title="Alerts and reports" description="What we tell you about. Saved on this device.">
                <SettingsRow
                    title="Traffic and ranking alerts"
                    description="Big drops in clicks or users, position losses and new keyword opportunities."
                    control={<Switch checked={prefs.seoAlerts} onCheckedChange={(v) => toggle('seoAlerts', v)} ariaLabel="Traffic and ranking alerts" />}
                />
                <SettingsRow
                    title="Weekly report"
                    description="A short summary of traffic, rankings and what to look at next."
                    control={<Switch checked={prefs.weeklyReport} onCheckedChange={(v) => toggle('weeklyReport', v)} ariaLabel="Weekly report" />}
                />
                <SettingsRow
                    title="Content decay warnings"
                    description="When a page loses a lot of its search traffic."
                    control={<Switch checked={prefs.contentDecay} onCheckedChange={(v) => toggle('contentDecay', v)} ariaLabel="Content decay warnings" />}
                />
            </SettingsSection>
            <PushSection />
        </>
    );
}

const noopSubscribe = () => () => {};

function PushSection() {
    // Browser capability is only known on the client: false on the server and during hydration.
    const supported = useSyncExternalStore(noopSubscribe, isPushSupported, () => false);
    const [override, setOverride] = useState<boolean | null>(null);
    const [requesting, setRequesting] = useState(false);

    if (!supported) return null;
    const enabled = override ?? isPushEnabled();

    const toggle = async (next: boolean) => {
        if (!next) {
            disablePush();
            setOverride(false);
            return;
        }
        setRequesting(true);
        const granted = await requestPushPermission();
        setOverride(granted);
        setRequesting(false);
    };

    return (
        <SettingsSection title="Browser notifications" description="Pop-ups from this browser while TrafficClaw is open.">
            <SettingsRow
                title="Critical alerts"
                description={enabled ? 'This browser will show an alert when something serious is detected.' : 'Get an instant browser alert for serious issues.'}
                control={<Switch checked={enabled} onCheckedChange={(v) => void toggle(v)} ariaLabel="Browser notifications for critical alerts" disabled={requesting} />}
            />
        </SettingsSection>
    );
}
