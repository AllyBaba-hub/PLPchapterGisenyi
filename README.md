# PLP Chapter Gisenyi Website & Management System

Production-ready Next.js, Supabase, Tailwind, TypeScript, and Resend system for public content, membership applications, member dashboards, events, gallery, reports, RBAC administration, immutable audit logs, and transactional member notifications.

## Tech Stack
- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security, Storage
- Resend for server-side transactional email delivery
- Jest, React Testing Library, Playwright

## Setup
```bash
npm install
npm run dev
```

## Environment Variables
Configure these in `.env.local` and Vercel project settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to frontend)
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_REPLY_TO_ADDRESS`

## Supabase Setup
1. Create a Supabase project and enable Auth.
2. Run migrations from `supabase/migrations` using the Supabase CLI.
3. Confirm RLS is enabled on every application table.
4. Confirm Storage buckets exist: `profile_images`, `event_images`, `gallery_media`, and `branding_assets`.
5. Upload primary, white, and icon logo variants to `branding_assets`; the app also ships `/public` fallbacks.

## Authentication and Authorization
Supabase Auth is the only authentication provider. Middleware protects `/admin`, `/admin/audit`, and `/member` routes. Backend mutations validate JWT sessions, verify roles server-side, validate inputs with Zod, and rely on RLS policies for database isolation.

Roles are `SUPER_ADMIN`, `ADMIN`, and `MEMBER`. Audit logs are visible only to `SUPER_ADMIN` and are immutable by trigger.

## Email Service
Transactional email is server-side only through `services/email.ts`. Member status changes send reusable branded HTML and plain-text templates after successful database updates. Email failures are caught and logged so they do not roll back the core membership update. Templates cover application submission, approval, rejection, activation, suspension, role changes, password reset confirmations, event registration confirmations, and event cancellation confirmations.

## Deployment
### Vercel
1. Connect the GitHub repository to Vercel.
2. Deploy from the `main` branch.
3. Set all environment variables securely.
4. Use `npm run build` as the production build command.

### Supabase
1. Apply migrations automatically in CI/CD or with `supabase db push`.
2. Enable Auth providers and secure password reset URLs.
3. Verify RLS policies and Storage bucket policies before production traffic.

## CI/CD
GitHub Actions runs linting, Jest coverage, and a Next.js production build. Deployment should be blocked when any check fails.

## Folder Structure
- `/app` - Next.js pages, layouts, and API route handlers
- `/components` - shared UI such as branding/logo components
- `/lib` - Supabase clients, RBAC, validation, utility functions
- `/services` - server-only audit and email services
- `/middleware.ts` - route protection
- `/types` - shared TypeScript domain types
- `/supabase/migrations` - database schema, RLS, indexes, storage buckets

## Admin Usage Guide
Admins use the dashboard to manage members, approve or reject applications, change roles, create events, publish news, upload gallery media, and review reports. When an admin updates a member status or role, the API updates the database, writes an audit entry, sends the appropriate PLP Chapter Gisenyi email, and logs delivery success or failure.

## Testing
- `npm test` runs Jest coverage for RBAC, validation, API handlers, and email helpers.
- `npm run test:e2e` runs Playwright flows for public pages, registration, admin publishing, role restrictions, and member approval notifications.
