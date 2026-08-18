import { NextRequest, NextResponse } from 'next/server';

const RATE_LIMIT_MAP = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const now = Date.now();
        const lastRequest = RATE_LIMIT_MAP.get(ip);
        if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW) {
            return NextResponse.json(
                { error: 'Please wait a moment before sending another message.' },
                { status: 429 }
            );
        }
        RATE_LIMIT_MAP.set(ip, now);

        const body = await req.json();
        const { name, email, message } = body;

        if (!name || !email || !message) {
            return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
        }

        if (typeof name !== 'string' || name.length > 100) {
            return NextResponse.json({ error: 'Invalid name.' }, { status: 400 });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== 'string' || !emailRegex.test(email) || email.length > 254) {
            return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
        }
        if (typeof message !== 'string' || message.length > 2000) {
            return NextResponse.json({ error: 'Message is too long (max 2000 characters).' }, { status: 400 });
        }

        // Save to admin API database
        const adminUrl = process.env.ADMIN_API_URL;
        const adminKey = process.env.ADMIN_API_KEY;

        if (adminUrl && adminKey) {
            const res = await fetch(`${adminUrl}/contact`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': adminKey,
                },
                body: JSON.stringify({ name, email, message, ip_address: ip }),
            });

            if (!res.ok) {
                console.error('[Contact] Admin API error:', res.status, await res.text());
            }
        } else {
            // Fallback: log to console when admin API is not configured
            console.log('[Contact] New submission:', { name, email, message: message.slice(0, 100) });
        }

        return NextResponse.json({
            success: true,
            message: "Your message has been received! We'll get back to you soon.",
        });
    } catch (error) {
        console.error('[Contact] Error:', error);
        return NextResponse.json({ error: 'Something went wrong. Please try again later.' }, { status: 500 });
    }
}
