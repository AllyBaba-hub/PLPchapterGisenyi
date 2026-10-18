-- PLP Chapter Gisenyi - schema, RLS, audit immutability, storage (Part 2 of the specification)
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
create extension if not exists pgcrypto;

-- 2.2 enums
create type user_role as enum ('SUPER_ADMIN','CHAPTER_LEADER','VICE_LEADER','SECRETARY','MEMBERSHIP_OFFICER','EVENTS_COORDINATOR','COMMUNICATIONS_OFFICER','TREASURER','MEMBER');
create type application_status as enum ('PENDING','APPROVED','REJECTED');
create type event_status as enum ('UPCOMING','ONGOING','COMPLETED','CANCELLED');

-- shared trigger: keep updated_at fresh
create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- 2.3 users (extends auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role user_role not null default 'MEMBER',
  is_active boolean not null default true,
  last_login timestamptz,
  prefs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_phone_key on users(phone) where phone is not null;

-- role helper used by every policy (security definer avoids recursive RLS on users)
create function auth_role() returns user_role language sql stable security definer set search_path = public as
$$ select role from public.users where id = auth.uid() and is_active $$;
create function has_role(variadic roles user_role[]) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(public.auth_role() = any(roles), false) $$;

-- 2.4 members (approved members only)
create sequence membership_seq;
create table members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  application_id uuid,
  membership_id text unique not null default ('PLP-GSY-' || to_char(now(),'YYYY') || '-' || lpad(nextval('membership_seq')::text, 4, '0')),
  full_name text not null, gender text, date_of_birth date,
  phone text, email text, school text, graduation_year int,
  district text, sector text, cell text, village text, occupation text, skills text,
  profile_image text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED')),
  join_date timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index members_phone_key on members(phone) where phone is not null;

-- 2.5 applications
create table applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, email text not null, phone text not null,
  gender text, date_of_birth date, school text, graduation_year int,
  district text, sector text, cell text, village text, occupation text, skills text, motivation text,
  agreement_accepted boolean not null default false check (agreement_accepted),
  agreement_accepted_at timestamptz default now(),
  status application_status not null default 'PENDING',
  reviewed_by uuid references users(id), reviewed_at timestamptz, review_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index applications_open_email on applications(lower(email)) where status <> 'REJECTED';
create unique index applications_open_phone on applications(phone) where status <> 'REJECTED';
alter table members add constraint members_application_fk foreign key (application_id) references applications(id);

-- 2.6 events (published/category/requirements/image added for the public site and admin UI)
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, location text, requirements text, category text default 'Other', image text,
  event_date timestamptz not null, status event_status not null default 'UPCOMING', published boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- 2.7 event registrations (no orphans, one per member per event)
create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  attendance_status text not null default 'REGISTERED' check (attendance_status in ('REGISTERED','ATTENDED','ABSENT','CANCELLED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);
-- 2.8 news
create table news (
  id uuid primary key default gen_random_uuid(),
  title text not null, content text not null, image text, published boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- 2.9 gallery
create table gallery (
  id uuid primary key default gen_random_uuid(),
  title text, description text, media_url text not null, media_type text check (media_type in ('image','video')),
  event_id uuid references events(id) on delete set null, album text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- 2.10 contacts
create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, subject text, message text not null,
  status text not null default 'NEW' check (status in ('NEW','READ','ARCHIVED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- announcements + notifications (Parts 5 and 6)
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null, priority text not null default 'NORMAL' check (priority in ('HIGH','NORMAL')),
  audience text not null default 'ALL' check (audience in ('ALL','DISTRICT','EVENT')), audience_value text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table announcement_reads (
  announcement_id uuid references announcements(id) on delete cascade, user_id uuid references users(id) on delete cascade,
  primary key (announcement_id, user_id)
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null, title text not null, body text, read boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now(), id uuid not null default gen_random_uuid(), created_at timestamptz not null default now());
create table email_logs (
  id uuid primary key default gen_random_uuid(), event text not null, user_id uuid references users(id),
  status text not null check (status in ('SENT','FAILED')), error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- 2.11 audit_logs (immutable)
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id), action text not null, entity text, entity_id text,
  metadata jsonb not null default '{}', ip_address text, user_agent text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function audit_logs_immutable() returns trigger language plpgsql as $$ begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_no_update before update or delete on audit_logs for each row execute function audit_logs_immutable();
create trigger audit_no_truncate before truncate on audit_logs for each statement execute function audit_logs_immutable();

-- 2.12 indexes
create index idx_members_status on members(status);
create index idx_applications_status on applications(status);
create index idx_events_date on events(event_date);
create index idx_audit_logs_user on audit_logs(user_id);
create index idx_audit_logs_action on audit_logs(action);
create index idx_audit_logs_created on audit_logs(created_at desc);
create index idx_news_published on news(published, created_at desc);
create index idx_reg_member on event_registrations(member_id);

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['users','members','applications','events','event_registrations','news','gallery','contacts','announcements','notifications','settings','email_logs'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop; end $$;

-- new auth user -> public.users row
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, email, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), lower(new.email), new.raw_user_meta_data->>'phone');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- role guards: only SUPER_ADMIN (or the service role, auth.uid() is null) can change roles; never remove the last SUPER_ADMIN; audit every change
create function guard_role_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and public.auth_role() <> 'SUPER_ADMIN' then raise exception 'Only SUPER_ADMIN can change roles'; end if;
    if old.role = 'SUPER_ADMIN' and (select count(*) from public.users where role = 'SUPER_ADMIN' and is_active) <= 1 then raise exception 'Cannot remove the last SUPER_ADMIN'; end if;
    insert into public.audit_logs(user_id, action, entity, entity_id, metadata) values (auth.uid(), 'ROLE_CHANGED', 'users', new.id::text, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if auth.uid() is not null and public.auth_role() <> 'SUPER_ADMIN' and (new.is_active is distinct from old.is_active or new.email is distinct from old.email) then raise exception 'Not allowed'; end if;
  return new;
end $$;
create trigger users_guard before update on users for each row execute function guard_role_change();

-- members: members may only touch non-critical columns of their own row
create function guard_member_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role('MEMBERSHIP_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN') then
    if new.membership_id is distinct from old.membership_id or new.status is distinct from old.status or new.full_name is distinct from old.full_name
       or new.user_id is distinct from old.user_id or new.email is distinct from old.email or new.application_id is distinct from old.application_id then
      raise exception 'Members cannot change name, membership ID, status or account links';
    end if;
  end if;
  return new;
end $$;
create trigger members_guard before update on members for each row execute function guard_member_update();

-- applications: committee may only change decision fields
create function guard_application_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (to_jsonb(new) - 'status' - 'reviewed_by' - 'reviewed_at' - 'review_notes' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'reviewed_by' - 'reviewed_at' - 'review_notes' - 'updated_at') then
    raise exception 'Only the decision fields can be changed';
  end if;
  return new;
end $$;
create trigger applications_guard before update on applications for each row execute function guard_application_update();

-- 2.16 approval automation. The auth user is created server-side with the service role
-- (auth.admin.inviteUserByEmail), then this function creates the member atomically and audits it.
create function approve_application(p_application uuid, p_user uuid) returns members language plpgsql security definer set search_path = public as $$
declare a applications; m members;
begin
  if not public.has_role('MEMBERSHIP_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN') then raise exception 'Forbidden'; end if;
  select * into a from applications where id = p_application and status = 'PENDING' for update;
  if not found then raise exception 'Application not found or already reviewed'; end if;
  update users set full_name = a.full_name, phone = a.phone where id = p_user;
  insert into members(user_id, application_id, full_name, gender, date_of_birth, phone, email, school, graduation_year, district, sector, cell, village, occupation, skills)
  values (p_user, a.id, a.full_name, a.gender, a.date_of_birth, a.phone, lower(a.email), a.school, a.graduation_year, a.district, a.sector, a.cell, a.village, a.occupation, a.skills) returning * into m;
  update applications set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now() where id = a.id;
  insert into audit_logs(user_id, action, entity, entity_id, metadata) values
    (auth.uid(), 'APPLICATION_APPROVED', 'applications', a.id::text, jsonb_build_object('approved_by', auth.uid(), 'membership_id', m.membership_id)),
    (auth.uid(), 'MEMBER_CREATED', 'members', m.id::text, jsonb_build_object('membership_id', m.membership_id));
  return m;
end $$;
revoke all on function approve_application(uuid, uuid) from public, anon;
grant execute on function approve_application(uuid, uuid) to authenticated;

-- 2.13 Row Level Security: enabled on ALL tables
do $$ declare t text; begin
  foreach t in array array['users','members','applications','events','event_registrations','news','gallery','contacts','announcements','announcement_reads','notifications','settings','email_logs','audit_logs'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;

create policy users_self_read on users for select using (id = auth.uid() or has_role('SECRETARY','EVENTS_COORDINATOR','COMMUNICATIONS_OFFICER','MEMBERSHIP_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy users_self_update on users for update using (id = auth.uid() or has_role('SUPER_ADMIN')) with check (id = auth.uid() or has_role('SUPER_ADMIN'));

create policy members_read on members for select using (user_id = auth.uid() or has_role('SECRETARY','EVENTS_COORDINATOR','COMMUNICATIONS_OFFICER','MEMBERSHIP_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy members_self_update on members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_staff_update on members for update using (has_role('MEMBERSHIP_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));

create policy applications_public_insert on applications for insert to anon, authenticated with check (status = 'PENDING' and agreement_accepted and reviewed_by is null);
create policy applications_committee_read on applications for select using (has_role('MEMBERSHIP_OFFICER','SECRETARY','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy applications_decide on applications for update using (has_role('MEMBERSHIP_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));

create policy events_public_read on events for select using (published or has_role('EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy events_manage on events for all using (has_role('EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN')) with check (has_role('EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));

create policy reg_read on event_registrations for select using (member_id in (select id from members where user_id = auth.uid()) or has_role('EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy reg_insert on event_registrations for insert with check (attendance_status = 'REGISTERED' and member_id in (select id from members where user_id = auth.uid() and status = 'ACTIVE') and exists (select 1 from events e where e.id = event_id and e.published and e.status in ('UPCOMING','ONGOING')));
create policy reg_cancel on event_registrations for update using (member_id in (select id from members where user_id = auth.uid())) with check (attendance_status in ('REGISTERED','CANCELLED') and member_id in (select id from members where user_id = auth.uid()));
create policy reg_staff_update on event_registrations for update using (has_role('EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));

create policy news_public_read on news for select using (published or has_role('COMMUNICATIONS_OFFICER','CHAPTER_LEADER','SUPER_ADMIN'));
create policy news_manage on news for insert with check (has_role('COMMUNICATIONS_OFFICER','CHAPTER_LEADER','SUPER_ADMIN'));
create policy news_update on news for update using (has_role('COMMUNICATIONS_OFFICER','CHAPTER_LEADER','SUPER_ADMIN'));
create policy news_delete on news for delete using (has_role('CHAPTER_LEADER','SUPER_ADMIN'));

create policy gallery_public_read on gallery for select using (true);
create policy gallery_manage on gallery for all using (has_role('COMMUNICATIONS_OFFICER','SUPER_ADMIN')) with check (has_role('COMMUNICATIONS_OFFICER','SUPER_ADMIN'));

create policy contacts_public_insert on contacts for insert to anon, authenticated with check (status = 'NEW');
create policy contacts_staff on contacts for select using (has_role('SECRETARY','COMMUNICATIONS_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy contacts_staff_update on contacts for update using (has_role('SECRETARY','COMMUNICATIONS_OFFICER','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));

create policy ann_read on announcements for select using (auth.uid() is not null);
create policy ann_manage on announcements for insert with check (has_role('COMMUNICATIONS_OFFICER','SECRETARY','EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy ann_reads_own on announcement_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_own_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_read on settings for select using (true);
create policy settings_write on settings for all using (has_role('SUPER_ADMIN')) with check (has_role('SUPER_ADMIN'));
create policy email_logs_read on email_logs for select using (has_role('CHAPTER_LEADER','SUPER_ADMIN'));

-- audit_logs: ONLY SUPER_ADMIN can read; there is no insert/update/delete policy, so writes happen server-side with the service role only
create policy audit_logs_super_admin_only on audit_logs for select using (has_role('SUPER_ADMIN'));

-- 2.14 storage buckets (public read; type and size limits enforced by the bucket)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('profile_images','profile_images',true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('event_images','event_images',true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('gallery_media','gallery_media',true, 104857600, array['image/jpeg','image/png','image/webp','video/mp4']),
  ('branding_assets','branding_assets',true, 10485760, array['image/png','image/svg+xml','image/webp'])
on conflict (id) do nothing;
create policy "public read buckets" on storage.objects for select using (bucket_id in ('profile_images','event_images','gallery_media','branding_assets'));
create policy "profile images own folder" on storage.objects for insert to authenticated with check (bucket_id = 'profile_images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event images staff" on storage.objects for insert to authenticated with check (bucket_id = 'event_images' and has_role('EVENTS_COORDINATOR','CHAPTER_LEADER','VICE_LEADER','SUPER_ADMIN'));
create policy "gallery staff" on storage.objects for insert to authenticated with check (bucket_id = 'gallery_media' and has_role('COMMUNICATIONS_OFFICER','SUPER_ADMIN'));
create policy "gallery staff delete" on storage.objects for delete to authenticated using (bucket_id = 'gallery_media' and has_role('COMMUNICATIONS_OFFICER','SUPER_ADMIN'));
create policy "branding super admin" on storage.objects for all to authenticated using (bucket_id = 'branding_assets' and has_role('SUPER_ADMIN')) with check (bucket_id = 'branding_assets' and has_role('SUPER_ADMIN'));
