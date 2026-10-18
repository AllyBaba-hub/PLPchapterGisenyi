import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';
export function requireServerEnv(name: string) { const v = process.env[name]; if (!v) throw new Error(`Missing ${name}`); return v; }
/** Per-request client acting as the signed-in user, so RLS applies. */
export function createSupabaseServerClient() {
  const store = cookies();
  return createServerClient(requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'), requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({name, value, options}) => store.set(name, value, options)); } catch { /* called from a Server Component; middleware refreshes the session */ } },
    },
  });
}
/** Service-role client: bypasses RLS. Server only; never import from client components. */
export function createSupabaseAdminClient() {
  return createClient(requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'), requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false, autoRefreshToken: false}});
}
/** Resolve the caller from the verified JWT and read the role from public.users (never from a cookie). */
export async function getSessionUser() {
  const supabase = createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return null;
  const {data} = await supabase.from('users').select('id,email,role,is_active').eq('id', user.id).single();
  if (!data || !data.is_active) return null;
  return {supabase, user: {id: data.id as string, email: data.email as string, role: data.role as import('@/types').Role}};
}
