import {NextResponse} from 'next/server';
import {eventRegistrationSchema} from '@/lib/validation';
import {getSessionUser} from '@/lib/supabase';
import {logAuditEvent} from '@/services/audit';
import {sendTransactionalEmail} from '@/services/email';
export async function POST(req: Request) {
  const body = eventRegistrationSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({error: 'Invalid request'}, {status: 400});
  const session = await getSessionUser();
  if (!session) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  if (session.user.role !== 'MEMBER') return NextResponse.json({error: 'Forbidden'}, {status: 403});
  // member is derived from the session: a caller can never register someone else
  const {data: member} = await session.supabase.from('members').select('id,email,full_name,status').eq('user_id', session.user.id).single();
  if (!member || member.status !== 'ACTIVE') return NextResponse.json({error: 'Forbidden'}, {status: 403});
  const {data, error} = await session.supabase.from('event_registrations').insert({event_id: body.data.eventId, member_id: member.id}).select('id,event:events(title)').single();
  if (error) return NextResponse.json({error: error.code === '23505' ? 'You are already registered for this event' : 'Registration failed'}, {status: error.code === '23505' ? 409 : 500});
  await logAuditEvent({userId: session.user.id, action: 'EVENT_REGISTRATION_CREATED', entity: 'event_registrations', entityId: data.id, metadata: {event_id: body.data.eventId}, request: req}).catch(() => undefined);
  const title = (data.event as unknown as {title: string} | null)?.title ?? 'the event';
  try { await sendTransactionalEmail({to: member.email, event: 'EVENT_REGISTRATION_CONFIRMATION', member: {email: member.email, fullName: member.full_name}, data: {eventName: title}}); } catch { /* logged by email_logs in production; never breaks the registration */ }
  return NextResponse.json({registration: {id: data.id}});
}
