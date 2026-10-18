import {z} from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import {ROLES} from '@/types';
export const memberStatusSchema = z.object({ memberId: z.string().uuid(), status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().min(5).max(500).optional() })
  .refine((v) => v.status !== 'SUSPENDED' || !!v.reason, { message: 'A reason is required to suspend', path: ['reason'] });
export const roleChangeSchema = z.object({ userId: z.string().uuid(), role: z.enum(ROLES) });
/** The member is derived from the signed-in session on the server, never taken from the request. */
export const eventRegistrationSchema = z.object({ eventId: z.string().uuid() });
export const applicationSchema = z.object({
  full_name: z.string().trim().min(3).max(100), email: z.string().trim().email(), phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/),
  date_of_birth: z.string().date(), school: z.string().trim().min(1).max(120), graduation_year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 8),
  district: z.string().trim().min(1), sector: z.string().trim().min(1), cell: z.string().trim().min(1), village: z.string().trim().min(1),
  occupation: z.string().max(120).optional(), skills: z.string().max(500).optional(), motivation: z.string().trim().min(20).max(1500),
  agreement_accepted: z.literal(true, {errorMap: () => ({message: 'You must accept the Membership Agreement'})}),
});
export const contactSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email(), subject: z.string().max(150).optional(), message: z.string().trim().min(10).max(3000) });
export const richTextSchema = z.string().min(1).max(50000).transform((v) => DOMPurify.sanitize(v, {ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img'], ALLOWED_ATTR: ['href', 'src', 'alt']}));
