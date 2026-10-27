'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { LogOut, Trash2 } from 'lucide-react';

import { Field, Input } from '@/components/app/Field';
import { SettingsRow, SettingsSection } from '@/components/app/SettingsSection';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const CONFIRM_WORD = 'DELETE';

/**
 * Danger zone (DESIGN 5.14): sign out and delete the account.
 *
 * Deleting is a request: it lands in the support inbox, where an admin removes
 * the account and everything stored with it (the admin delete-user cascade).
 * No fixed number of days is promised (same wording as /security). Nothing is
 * removed from the browser until the user confirms by typing DELETE.
 */
export function DangerTab() {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requestDeletion = async () => {
        if (typed.trim() !== CONFIRM_WORD || sending) return;
        setSending(true);
        setError(null);
        try {
            const res = await fetch('/api/support/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: 'Account deletion request: please delete my TrafficClaw account and all data associated with it. I confirmed this in Settings, Danger zone.',
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                setError(payload?.error || 'Could not send your request. Try again, or email privacy@trafficclaw.com.');
                return;
            }
            setSent(true);
            setOpen(false);
            setTyped('');
            toast.success('Deletion request sent');
        } catch {
            setError('Could not send your request. Check your connection and try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <SettingsSection title="Sign out" description="Ends your session on this device.">
                <SettingsRow
                    title="Sign out of TrafficClaw"
                    description="Your data stays in your account. You can sign back in with Google at any time."
                    control={<Button variant="secondary" icon={LogOut} onClick={() => void signOut({ callbackUrl: '/' })}>Sign out</Button>}
                />
            </SettingsSection>

            <SettingsSection danger title="Delete account" description="This cannot be undone.">
                {sent ? (
                    <Banner variant="success" title="Deletion requested">
                        We received your request. We will permanently delete your account and the data stored with it, and confirm in your support thread.
                    </Banner>
                ) : (
                    <SettingsRow
                        title="Delete my account and data"
                        description="Removes your profile, Google access tokens, dashboards, public links and Ask history."
                        control={<Button variant="danger" icon={Trash2} onClick={() => { setError(null); setOpen(true); }}>Delete account</Button>}
                    />
                )}
            </SettingsSection>

            <Modal
                open={open}
                onOpenChange={(o) => { setOpen(o); if (!o) setTyped(''); }}
                size="sm"
                title="Delete your account?"
                description="We will remove your account and everything stored with it. This cannot be undone."
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>Keep my account</Button>
                        <Button variant="danger" loading={sending} disabled={typed.trim() !== CONFIRM_WORD} onClick={() => void requestDeletion()}>Delete account</Button>
                    </>
                )}
            >
                <Field label={<>Type <span className="font-mono">{CONFIRM_WORD}</span> to confirm</>} error={error}>
                    {(p) => (
                        <Input
                            {...p}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void requestDeletion(); }}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                        />
                    )}
                </Field>
            </Modal>
        </>
    );
}
