import {NextResponse} from 'next/server';
import {roleChangeSchema} from '@/lib/validation';
import {createSupabaseAdminClient, getSessionUser} from '@/lib/supabase';
import {can} from '@/lib/rbac';
import {logAuditEvent} from '@/services/audit';
import {sendTransactionalEmail} from '@/services/email';
export async function POST(req: Request) {
  const body = roleChangeSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({error: 'Invalid request'}, {status: 400});
  const session = await getSessionUser();
  if (!session) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!can(session.user.role, 'roles.manage')) return NextResponse.json({error: 'Forbidden'}, {status: 403});
  // the guard_role_change trigger refuses to remove the last SUPER_ADMIN and audits the change
  const {data: user, error} = await session.supabase.from('users').update({role: body.data.role}).eq('id', body.data.userId).select('id,email,full_name,role').single();
  if (error || !user) return NextResponse.json({error: error?.message.includes('last SUPER_ADMIN') ? 'Cannot remove the last SUPER_ADMIN' : 'Update failed'}, {status: 400});
  try { await sendTransactionalEmail({to: user.email, event: 'MEMBER_ROLE_CHANGED', member: {email: user.email, fullName: user.full_name}, data: {role: user.role}}); }
  catch (e) { await createSupabaseAdminClient().from('email_logs').insert({event: 'MEMBER_ROLE_CHANGED', user_id: user.id, status: 'FAILED', error: String((e as Error).message).slice(0, 300)}); }
  await logAuditEvent({userId: session.user.id, action: 'ROLE_CHANGED', entity: 'users', entityId: user.id, metadata: {to: user.role}, request: req}).catch(() => undefined);
  return NextResponse.json({user: {id: user.id, role: user.role}});
}
