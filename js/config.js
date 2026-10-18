/* Runtime configuration.
 * emailEndpoint: optional URL of a SERVER-SIDE function (e.g. your Next.js /api/email route or a
 * Supabase Edge Function) that sends mail with Resend/SMTP. Credentials must never be placed here.
 * When empty, emails are rendered and stored in the local Email Outbox (Admin > Email Outbox). */
window.PLP_CONFIG = { emailEndpoint: '' };
