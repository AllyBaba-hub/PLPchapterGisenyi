import type {AuditAction} from '@/types';
import {createSupabaseAdminClient} from '@/lib/supabase';
export interface AuditInput { userId: string | null; action: AuditAction; entity?: string; entityId?: string; metadata?: Record<string, unknown>; request?: Request }
/** Server-side only (service role). audit_logs has no insert policy for clients. Never fails silently. */
export async function logAuditEvent({userId, action, entity, entityId, metadata = {}, request}: AuditInput) {
  const h = request?.headers;
  const ip = h?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h?.get('x-real-ip') ?? null;
  const {error} = await createSupabaseAdminClient().from('audit_logs').insert({user_id: userId, action, entity: entity ?? null, entity_id: entityId ?? null, metadata, ip_address: ip, user_agent: h?.get('user-agent') ?? null});
  if (error) { console.error('[audit] insert failed', action, error.message); throw new Error('Audit log could not be written'); }
}
