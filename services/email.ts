import {Resend} from 'resend';
import type {Member, MemberStatus, Role} from '@/types';
export type EmailEvent = 'APPLICATION_SUBMITTED' | 'APPLICATION_APPROVED' | 'APPLICATION_REJECTED' | 'MEMBER_ACTIVATED' | 'MEMBER_SUSPENDED' | 'MEMBER_ROLE_CHANGED' | 'PASSWORD_RESET_CONFIRMATION' | 'EVENT_REGISTRATION_CONFIRMATION' | 'EVENT_CANCELLATION_CONFIRMATION';
type Data = {status?: MemberStatus; role?: Role; eventName?: string; logoUrl?: string};
export function statusEvent(status: MemberStatus | 'APPROVED' | 'REJECTED' | 'PENDING'): EmailEvent {
  if (status === 'APPROVED') return 'APPLICATION_APPROVED'; if (status === 'REJECTED') return 'APPLICATION_REJECTED';
  if (status === 'ACTIVE') return 'MEMBER_ACTIVATED'; if (status === 'SUSPENDED') return 'MEMBER_SUSPENDED'; return 'APPLICATION_SUBMITTED';
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string));
const MESSAGES: Record<EmailEvent, (name: string, d: Data) => string> = {
  APPLICATION_SUBMITTED: (n) => `Thank you for applying to PLP Chapter Gisenyi, ${n}. Your application is PENDING review. We will email you when a decision is made.`,
  APPLICATION_APPROVED: () => 'Welcome to PLP Gisenyi, your application is approved.',
  APPLICATION_REJECTED: (n) => `Thank you for your interest in PLP Chapter Gisenyi, ${n}. Your application was not approved at this time. You are welcome to contact the chapter or apply again.`,
  MEMBER_ACTIVATED: (n) => `Hello ${n}, your PLP Chapter Gisenyi membership is active. New status: ACTIVE.`,
  MEMBER_SUSPENDED: (n) => `Hello ${n}, your PLP Chapter Gisenyi membership has been suspended. New status: SUSPENDED. Next step: please contact the chapter committee.`,
  MEMBER_ROLE_CHANGED: (n, d) => `Hello ${n}, your role in PLP Chapter Gisenyi has changed to ${d.role ?? 'a new role'}.`,
  PASSWORD_RESET_CONFIRMATION: (n) => `Hello ${n}, your password was just changed. If this was not you, contact the committee immediately.`,
  EVENT_REGISTRATION_CONFIRMATION: (n, d) => `Hello ${n}, your registration for "${d.eventName ?? 'the event'}" is confirmed.`,
  EVENT_CANCELLATION_CONFIRMATION: (n, d) => `Hello ${n}, your registration for "${d.eventName ?? 'the event'}" has been cancelled.`,
};
/** Internal admin notes are never passed to templates. */
export function renderEmailTemplate(event: EmailEvent, member: Pick<Member, 'fullName' | 'email'>, data: Data = {}) {
  const logo = data.logoUrl || `${process.env.NEXT_PUBLIC_APP_URL || ''}/plp-gisenyi-logo.svg`;
  const message = MESSAGES[event](member.fullName, data), title = event.replace(/_/g, ' ').toLowerCase();
  const text = `PLP Chapter Gisenyi\n\n${message}\n\nPeace, love and unity,\nPLP Chapter Gisenyi`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><div style="background:#0f7a3d;padding:16px;text-align:center"><img src="${esc(logo)}" alt="PLP Chapter Gisenyi" width="72" height="72"/><h1 style="color:#fff;font-size:20px;margin:8px 0 0">PLP Chapter Gisenyi</h1></div><div style="padding:24px;line-height:1.6"><p>${esc(message)}</p><p>Peace, love and unity,<br>PLP Chapter Gisenyi</p></div></div>`;
  return {subject: `PLP Chapter Gisenyi: ${title}`, html, text};
}
export async function sendTransactionalEmail(input: {to: string; event: EmailEvent; member: Pick<Member, 'fullName' | 'email'>; data?: Data}) {
  const from = process.env.EMAIL_FROM_ADDRESS, key = process.env.RESEND_API_KEY;
  if (!from || !key) throw new Error('Email service is not configured');
  const body = renderEmailTemplate(input.event, input.member, input.data);
  const {error} = await new Resend(key).emails.send({from, to: input.to, replyTo: process.env.EMAIL_REPLY_TO_ADDRESS, subject: body.subject, html: body.html, text: body.text});
  if (error) throw new Error(error.message);
}
