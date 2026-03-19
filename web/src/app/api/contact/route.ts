import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

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

        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = process.env.SMTP_PORT;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const contactEmail = process.env.CONTACT_EMAIL || 'trafficclaw@gmail.com';

        if (!smtpHost || !smtpUser || !smtpPass) {
            console.error('[Contact] SMTP not configured. Logging submission:', { name, email, message: message.slice(0, 100) });
            return NextResponse.json({ success: true, message: 'Your message has been received. We\'ll get back to you soon!' });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: Number(smtpPort) || 587,
            secure: Number(smtpPort) === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
            from: `"TrafficClaw Contact" <${smtpUser}>`,
            replyTo: email,
            to: contactEmail,
            subject: `[TrafficClaw] New query from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #10b981;">New Contact Query</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; font-weight: bold; color: #666;">Name</td><td style="padding: 8px 0;">${name}</td></tr>
                        <tr><td style="padding: 8px 0; font-weight: bold; color: #666;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
                    </table>
                    <div style="margin-top: 16px; padding: 16px; background: #f4f4f5; border-radius: 8px;">
                        <p style="margin: 0; white-space: pre-wrap;">${message}</p>
                    </div>
                </div>
            `,
        });

        return NextResponse.json({ success: true, message: 'Your message has been sent! We\'ll get back to you soon.' });
    } catch (error) {
        console.error('[Contact] Error:', error);
        return NextResponse.json({ error: 'Something went wrong. Please try again later.' }, { status: 500 });
    }
}
