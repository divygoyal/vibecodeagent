'use client';

import { signIn } from 'next-auth/react';

import { Button, GoogleMark } from '@/components/ui/Button';

export function JoinSignIn() {
    return (
        <Button variant="google" size="lg" onClick={() => void signIn('google', { callbackUrl: '/dashboard/leaderboard' })}>
            <GoogleMark size={18} /> Continue with Google
        </Button>
    );
}
