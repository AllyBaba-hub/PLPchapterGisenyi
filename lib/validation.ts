import {z} from 'zod';
export const memberStatusSchema=z.object({memberId:z.string().uuid(),status:z.enum(['PENDING','APPROVED','REJECTED','ACTIVE','SUSPENDED']),role:z.enum(['SUPER_ADMIN','ADMIN','MEMBER']).optional(),reason:z.string().max(500).optional()});
export const eventRegistrationSchema=z.object({eventId:z.string().uuid(),memberId:z.string().uuid()});
export const richTextSchema=z.string().min(1).max(20000).transform(v=>v.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''));
