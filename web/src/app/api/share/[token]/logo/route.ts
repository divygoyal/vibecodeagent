import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import { authOptions } from '@/lib/adminUserSync';
import { getShareData } from '@/app/api/share/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};
const MAX_BYTES = 1_000_000; // 1 MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
}

async function authorizeShare(token: string, userId: string) {
  const share = await getShareData(token, { incrementView: false });
  if (!share) return { ok: false as const, status: 404, error: 'Share not found' };
  if (share.userId !== userId) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, share };
}

/**
 * POST /api/share/[token]/logo — Upload a custom logo for a share's branding.
 * Body: multipart/form-data with field "file"
 * Returns: { logoUrl } — caller must PATCH /api/share?token= with branding.logoUrl set.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await params;
    const auth = await authorizeShare(token, session.user.id);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

    const dir = path.join(process.cwd(), 'public', 'uploads', 'share-logos', safeId(session.user.id));
    await mkdir(dir, { recursive: true });

    const filename = `${safeId(token)}.${ext}`;
    const fullPath = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    const logoUrl = `/uploads/share-logos/${safeId(session.user.id)}/${filename}?v=${Date.now()}`;
    return NextResponse.json({ logoUrl });
  } catch (err) {
    console.error('Share logo upload error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/share/[token]/logo — Remove the share's uploaded logo file.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { token } = await params;
    const auth = await authorizeShare(token, session.user.id);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dir = path.join(process.cwd(), 'public', 'uploads', 'share-logos', safeId(session.user.id));
    for (const ext of Object.values(ALLOWED_TYPES)) {
      const candidate = path.join(dir, `${safeId(token)}.${ext}`);
      try {
        await unlink(candidate);
      } catch {
        // ignore — file may not exist
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Share logo delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
