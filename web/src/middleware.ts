import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth gate for dashboard / admin / superadmin
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/superadmin')) {
    const token = await getToken({ req: request });

    if (!token) {
      const signInUrl = new URL('/', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Workspace-setup hard gate: any /dashboard/* request from a signed-in
    // user whose setup isn't completed gets bounced to /dashboard/setup
    // BEFORE the RSC ships. The flag is hydrated in lib/auth.ts on sign-in
    // and refreshed via NextAuth's update() trigger after the setup PATCH.
    // The setup route itself + the API surface are exempt.
    if (
      pathname.startsWith('/dashboard')
      && pathname !== '/dashboard/setup'
      && !pathname.startsWith('/dashboard/setup/')
      && !token.workspaceSetupCompleted
    ) {
      const setupUrl = new URL('/dashboard/setup', request.url);
      return NextResponse.redirect(setupUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*', '/superadmin', '/superadmin/:path*'],
};
