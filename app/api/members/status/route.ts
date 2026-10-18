import {NextResponse} from 'next/server';
import {memberStatusSchema} from '@/lib/validation';
import {createSupabaseAdminClient, getSessionUser} from '@/lib/supabase';
import {can} from '@/lib/rbac';
import {logAuditEvent} from '@/services/audit';
import {sendTransactionalEmail, statusEvent} from '@/services/email';
export async function POST(req: Request) {
  const body = memberStatusSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({error: 'Invalid request'}, {status: 400});
  const session = await getSessionUser();
  if (!session) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (!can(session.user.role, 'members.edit')) return NextResponse.json({error: 'Forbidden'}, {status: 403});
  const {memberId, status, reason} = body.data;
  // user-scoped client: RLS and the members_guard trigger apply as a second layer
  const {data: member, error} = await session.supabase.from('members').update({status}).eq('id', memberId).select('id,user_id,email,full_name,status').single();
  if (error || !member) return NextResponse.json({error: 'Update failed'}, {status: 500});
  await logAuditEvent({userId: session.user.id, action: status === 'SUSPENDED' ? 'MEMBER_SUSPENDED' : 'MEMBER_REACTIVATED', entity: 'members', entityId: member.id, metadata: {reason: reason ?? null}, request: req});
  // email only after the database update succeeded; a failure never rolls it back
  try {
    await sendTransactionalEmail({to: member.email, event: statusEvent(status), member: {email: member.email, fullName: member.full_name}, data: {status}});
    await logAuditEvent({userId: session.user.id, action: 'EMAIL_SENT', entity: 'members', entityId: member.id, metadata: {event: statusEvent(status)}, request: req});
  } catch (e) {
    await createSupabaseAdminClient().from('email_logs').insert({event: statusEvent(status), user_id: member.user_id, status: 'FAILED', error: String((e as Error).message).slice(0, 300)});
    await logAuditEvent({userId: session.user.id, action: 'EMAIL_FAILED', entity: 'members', entityId: member.id, metadata: {event: statusEvent(status)}, request: req}).catch(() => undefined);
  }
  return NextResponse.json({member: {id: member.id, status: member.status}});
}
