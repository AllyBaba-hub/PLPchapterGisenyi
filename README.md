# PLP Chapter Gisenyi - Website & Management System

Public website, membership applications with committee approval, member portal, admin dashboard (9 roles), immutable audit log and transactional email for **PLP Chapter Gisenyi** (Peace and Love Proclaimers, Rubavu District).

This repository contains **two parts that share the same rules** (roles, permission matrix, audit actions, schema):

| Part | What it is | Status |
|---|---|---|
| **Static app** (`index.html`, `css/`, `js/`) | The complete site. No install, no build. Opens in any browser. Uses a local backend (localStorage + IndexedDB) that mirrors the Supabase schema. | Fully built and browser-tested (see *Verification*). |
| **Next.js + Supabase** (`app/`, `lib/`, `services/`, `middleware.ts`, `supabase/migrations/`) | The production path: Supabase Auth/Postgres/RLS/Storage, Vercel, Resend. | Security core, API routes, SQL and tests are written. **Pages are not yet ported** from the static app, and it has **not been built or run** (see *Verification*). |

## Quick start (static app)
1. Unzip and open `index.html` in a browser (or `python3 -m http.server 8080`, then visit http://localhost:8080).
2. First run goes to **/setup**: create the first **Super Admin** (there are no default or shared accounts).
3. Anyone can apply at **Join Us**. Sign in as Super Admin, open **Applications**, review and approve. The applicant receives a welcome email containing a one-time link to choose a password.

> **Important:** the static app stores data in *this browser only*. Anyone with access to the browser's developer tools can read or change that data, so it is a fully working system for a single device, demos and testing, **not** a secure multi-user deployment. For real use, deploy the Next.js + Supabase path, where the same rules are enforced by Postgres Row Level Security.

### Emails in the static app
Browsers cannot send email safely (credentials would be exposed). Emails are rendered from branded templates and stored in **Admin > Email Outbox**. To send them for real, point `emailEndpoint` in `js/config.js` at a server-side function (your Next.js route or a Supabase Edge Function using Resend/SMTP). Delivery success/failure is audited, failures are listed for review, and a failed email never undoes the database change.

## Features
- **Public:** Home (live stats), Our Story, Events (filters, details, registration), Gallery (albums, lightbox, lazy loading), News (search, pagination), Join Us (mandatory agreement), Contact, Privacy, Terms, per-page SEO/Open Graph, accessible and mobile-first.
- **Auth:** email+password, failed-login audit with generic errors, lockout after 5 failures/15 min, password reset by email link, 7-day session expiry, 30-minute idle logout for committee roles, suspended members cannot sign in.
- **Member portal:** dashboard, profile (+photo), events register/cancel, notifications, announcements, history, membership card with QR (encodes the membership ID), settings.
- **Admin:** overview, applications (approve/reject with audit + email), members (search, filters, edit, suspend/reactivate, CSV/PDF export), events (CRUD, publish, registrations, attendance), news CMS (sanitised rich text), gallery (type/size validation, UUID file names), messages, announcements, reports (charts, date range, CSV/PDF), email outbox, roles, audit logs, system settings.
- **Roles:** SUPER_ADMIN, CHAPTER_LEADER, VICE_LEADER, SECRETARY, MEMBERSHIP_OFFICER, EVENTS_COORDINATOR, COMMUNICATIONS_OFFICER, TREASURER (overview only), MEMBER. Every action is checked server-side-style in `js/db.js` (`need(permission)`), never only in the UI.

## Next.js + Supabase setup
```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```
Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO_ADDRESS`.

**Database:** `supabase db push` applies `supabase/migrations/0001_init.sql` (tables, enums, indexes, RLS on every table, immutable `audit_logs`, role/last-Super-Admin guards, `approve_application()`, storage buckets `profile_images`, `event_images`, `gallery_media`, `branding_assets`). Create the first Super Admin by signing up a user in Supabase Auth, then run `update users set role='SUPER_ADMIN' where email='you@example.com';` in the SQL editor.

**Approval flow in production:** a server route creates the auth user with the service role (`auth.admin.inviteUserByEmail`), then calls `approve_application(application_id, user_id)` as the signed-in officer, then sends the welcome email.

**Deploy:** connect the repo to Vercel (deploy from `main`), set the env vars, build command `npm run build`. CI (`.github/workflows/ci.yml`) runs lint, tests and build.

## Folder structure
- `index.html`, `css/`, `js/` - static app (`core.js` utilities, `db.js` data/RBAC/audit/email, `ui.js` router and layouts, `public.js`, `member.js`, `admin.js`, `admin2.js`, `qr.js`, `config.js`)
- `/app`, `/components`, `/lib`, `/services`, `middleware.ts`, `/types` - Next.js app (`lib/rbac.ts` permission matrix, `services/audit.ts`, `services/email.ts`)
- `/supabase/migrations` - SQL schema and RLS
- `/__tests__` Jest, `/tests/e2e` Playwright (Next.js), `/tests/*.py` browser tests for the static app

## Admin guide
Approve applications under **Applications**; manage people under **Members**; create events under **Events** (tick *Publish* to show them publicly) and mark attendance under **Attendance**; write and publish articles under **News**; upload media under **Gallery**. Status changes (approve, reject, suspend, reactivate, role change, event registration) automatically queue the matching email after the database update succeeds.

## Verification (what was actually run)
- Static app: 3 scripted end-to-end suites in headless Chromium over `file://` (`tests/e2e-static-*.py`, run with `python3 tests/<file>` from this folder; needs `pip install playwright opencv-python-headless`, then `python3 tests/make_fixtures.py` once), covering 120+ checks: all routes, validation, join/approval workflow, emails, audit entries, permission matrix for all 8 roles, member portal, uploads, exports (CSV and PDF opened and parsed), rate limiting, suspension, session expiry, mobile layout. QR codes are decoded with OpenCV.
- Next.js: `lib/rbac.ts` + `types` pass `tsc --strict`, and the real `rbac.ts` was run against the spec's permission matrix.
- **Not run:** `npm install`, `next build`, Jest, ESLint, Playwright for Next.js, and the SQL migration (no network or Postgres was available). Run `npm ci && npm run lint && npm test && npm run build` and `supabase db push` and fix any environment-specific findings before going live.
