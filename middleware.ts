import {createServerClient} from '@supabase/ssr';
import {NextRequest, NextResponse} from 'next/server';
import {canAccessRoute, isAdminRole} from '@/lib/rbac';
import type {Role} from '@/types';
/** Verifies the Supabase JWT and reads the role from public.users. The role is never trusted from a client-set cookie. */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({request: req});
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {getAll: () => req.cookies.getAll(), setAll: (list) => list.forEach(({name, value, options}) => res.cookies.set(name, value, options))},
  });
  const {data: {user}} = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const toLogin = () => { const u = new URL('/login', req.url); u.searchParams.set('next', path); return NextResponse.redirect(u); };
  if (!user) return toLogin();
  const {data: profile} = await supabase.from('users').select('role,is_active').eq('id', user.id).single();
  if (!profile || !profile.is_active) return toLogin();
  const role = profile.role as Role;
  if (!canAccessRoute(role, path)) {
    if (isAdminRole(role) && !path.startsWith('/admin')) return NextResponse.redirect(new URL('/admin', req.url));
    return NextResponse.rewrite(new URL('/403', req.url), {status: 403});
  }
  return res;
}
export const config = {matcher: ['/admin/:path*', '/dashboard/:path*', '/profile']};
