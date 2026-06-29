// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresh the session if it's expired
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If user is NOT logged in and trying to access /admin
  if (!session && req.nextUrl.pathname.startsWith('/admin')) {
    // Redirect them to /login
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

// Ensure this only runs on /admin routes
export const config = {
  matcher: ['/admin/:path*'],
};
