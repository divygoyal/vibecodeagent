import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Auth gate for dashboard / admin / superadmin
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/superadmin')) {
    const token = await getToken({ req: request });

    // Preserve the FULL original URL (path + query string) so deep-link
    // emails like /dashboard/ai-chat?q=…&property=…&site=… survive both
    // the auth round-trip and the workspace-setup gate. Without this,
    // NextAuth would land users on a bare /dashboard/ai-chat after login
    // and AutoPromptFromQuery would never fire.
    const originalPathPlusSearch = `${pathname}${search}`;

    if (!token) {
      const signInUrl = new URL('/', request.url);
      signInUrl.searchParams.set('callbackUrl', originalPathPlusSearch);
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
      // Preserve where the user was trying to go so the setup page can
      // bounce them back after completion (see /dashboard/setup/page.tsx).
      setupUrl.searchParams.set('returnTo', originalPathPlusSearch);
      return NextResponse.redirect(setupUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*', '/superadmin', '/superadmin/:path*'],
};
