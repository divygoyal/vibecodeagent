'use client';

import { Button, Modal } from '@/components/ui';
import { BRAND_NAME } from '@/lib/brand';

interface CreditWelcomeProps {
    credits: number;
    onDismiss: () => void;
}

/** One-time welcome after the first sign-in (welcome_seen on the admin user): the free Ask messages. */
export default function CreditWelcome({ credits, onDismiss }: CreditWelcomeProps) {
    return (
        <Modal
            open
            onOpenChange={(open) => { if (!open) onDismiss(); }}
            size="sm"
            title={`Welcome to ${BRAND_NAME}`}
            footer={<Button variant="primary" onClick={onDismiss}>Got it</Button>}
        >
            <p className="text-body text-fg-secondary">
                You have <strong className="text-fg">{credits} free Ask messages</strong> for the built-in AI. Everything else is free,
                with no limit on sites.
            </p>
        </Modal>
    );
}
