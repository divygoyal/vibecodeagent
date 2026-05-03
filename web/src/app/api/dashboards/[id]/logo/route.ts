import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};
const MAX_BYTES = 1_000_000; // 1 MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

async function verifyOwnership(id: string, userId: string): Promise<boolean> {
  if (!ADMIN_API_KEY) return true; // dev fallback
  try {
    const res = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards/${id}?user_identifier=${userId}`,
      { headers: { 'X-API-Key': ADMIN_API_KEY } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * POST /api/dashboards/[id]/logo — Upload a logo for a dashboard's share/branding.
 * Body: multipart/form-data with field "file"
 * Returns: { logoUrl }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    if (!(await verifyOwnership(id, userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use PNG, JPG, SVG, or WebP.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 1 MB)' }, { status: 413 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'logos', safeId(userId));
    await mkdir(dir, { recursive: true });

    const filename = `${safeId(id)}.${ext}`;
    const fullPath = path.join(dir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    // Cache-bust query so the iframe and editor pick up the new logo immediately.
    const logoUrl = `/uploads/logos/${safeId(userId)}/${filename}?v=${Date.now()}`;
    return NextResponse.json({ logoUrl });
  } catch (err) {
    console.error('Logo upload error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboards/[id]/logo — Remove the uploaded logo file.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    if (!(await verifyOwnership(id, userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'logos', safeId(userId));
    for (const ext of Object.values(ALLOWED_TYPES)) {
      const candidate = path.join(dir, `${safeId(id)}.${ext}`);
      try {
        await unlink(candidate);
      } catch {
        // ignore — file may not exist
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Logo delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
