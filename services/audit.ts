import type {AuditAction} from '@/types';
export async function logAudit(supabase:any,actorId:string,action:AuditAction,metadata:Record<string,unknown>={}){await supabase.from('audit_logs').insert({actor_id:actorId,action,metadata});}
