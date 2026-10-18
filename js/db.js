/* PLP Chapter Gisenyi - data layer.
 * Local backend (localStorage + IndexedDB) that mirrors the Supabase schema (supabase/migrations).
 * Every mutation goes through API functions that (1) check the signed-in user's role, (2) validate input,
 * (3) write an append-only audit entry. The UI never touches storage directly. */
(function (w) {
  'use strict';
  const PLP = (w.PLP = w.PLP || {}), U = PLP.U, V = PLP.V;
  const KEY = 'plp_gisenyi_db_v1', SKEY = 'plp_gisenyi_session_v1', AKEY = 'plp_gisenyi_attempts_v1';
  const DAY = 864e5;

  const ROLES = ['SUPER_ADMIN', 'CHAPTER_LEADER', 'VICE_LEADER', 'SECRETARY', 'MEMBERSHIP_OFFICER', 'EVENTS_COORDINATOR', 'COMMUNICATIONS_OFFICER', 'TREASURER', 'MEMBER'];
  const LEAD = ['CHAPTER_LEADER', 'VICE_LEADER', 'SUPER_ADMIN'];
  const PERMS = {
    'members.view': ['SECRETARY', 'EVENTS_COORDINATOR', 'COMMUNICATIONS_OFFICER', 'MEMBERSHIP_OFFICER', ...LEAD],
    'members.edit': ['MEMBERSHIP_OFFICER', ...LEAD],
    'applications.view': ['MEMBERSHIP_OFFICER', 'SECRETARY', ...LEAD],
    'applications.decide': ['MEMBERSHIP_OFFICER', ...LEAD],
    'events.manage': ['EVENTS_COORDINATOR', ...LEAD],
    'events.overridePast': ['CHAPTER_LEADER', 'SUPER_ADMIN'],
    'news.manage': ['COMMUNICATIONS_OFFICER', 'CHAPTER_LEADER', 'SUPER_ADMIN'],
    'news.delete': ['CHAPTER_LEADER', 'SUPER_ADMIN'],
    'gallery.manage': ['COMMUNICATIONS_OFFICER', 'SUPER_ADMIN'],
    'messages.manage': ['SECRETARY', 'COMMUNICATIONS_OFFICER', ...LEAD],
    'reports.view': ['SECRETARY', 'CHAPTER_LEADER', 'SUPER_ADMIN'],
    'announce.send': ['COMMUNICATIONS_OFFICER', 'SECRETARY', 'EVENTS_COORDINATOR', ...LEAD],
    'emails.view': ['CHAPTER_LEADER', 'SUPER_ADMIN'],
    'audit.view': ['SUPER_ADMIN'], 'roles.manage': ['SUPER_ADMIN'], 'settings.manage': ['SUPER_ADMIN'],
  };
  const isAdminRole = (r) => ROLES.includes(r) && r !== 'MEMBER';
  const can = (role, perm) => !!role && (PERMS[perm] || []).includes(role);
  PLP.RBAC = { ROLES, PERMS, can, isAdminRole };

  const err = (code, msg, fields) => Object.assign(new Error(msg), { code, fields });
  PLP.err = err;

  /* ---------- storage ---------- */
  const blank = () => ({ v: 1, users: [], members: [], applications: [], events: [], event_registrations: [], news: [], gallery: [], contacts: [], audit_logs: [], announcements: [], announcement_reads: [], notifications: [], activity: [], emails: [], resets: [], settings: {}, counters: { member: 0 } });
  let cache = null, mem = null;
  const DEFAULT_SETTINGS = { chapter_name: 'PLP Chapter Gisenyi', contact_email: '', contact_phone: '', address: 'Gisenyi, Rubavu District, Rwanda', facebook: '', instagram: '', twitter: '', youtube: '', parent_url: 'http://peaceloveproclaimers.org/', monthly_fee: '', fee_rules: '', membership_rules: '', brand_color: '#0f7a3d', logo_ref: '', email_templates: {} };
  function load() {
    if (cache) return cache;
    try { const raw = localStorage.getItem(KEY); cache = raw ? JSON.parse(raw) : null; } catch (e) { cache = mem; }
    if (!cache || cache.v !== 1) cache = blank();
    return cache;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {
      if (e && /quota/i.test(e.name + e.message)) throw err('STORAGE_FULL', 'Browser storage is full. Remove old media or data and try again.');
      mem = cache;
    }
  }
  w.addEventListener('storage', (e) => { if (e.key === KEY) cache = null; });
  const db = () => load();
  const settings = () => Object.assign({}, DEFAULT_SETTINGS, db().settings);
  PLP.settings = settings;

  /* ---------- audit (append-only; no update/delete function exists) ---------- */
  function audit(userId, action, entity, entityId, metadata) {
    db().audit_logs.push({ id: U.uuid(), user_id: userId || null, action, entity: entity || null, entity_id: entityId || null, metadata: metadata || {}, ip_address: 'unavailable (browser client)', user_agent: navigator.userAgent, created_at: U.now() });
  }
  const track = (uid, type, text) => db().activity.push({ id: U.uuid(), user_id: uid, type, text, created_at: U.now() });
  const notify = (uid, type, title, body) => db().notifications.push({ id: U.uuid(), user_id: uid, type, title, body, read: false, created_at: U.now() });

  /* ---------- password hashing (PBKDF2) ---------- */
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function hashPw(pw, salt) {
    if (w.crypto && crypto.subtle) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']); return 'p1:' + hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256)); }
    let h = 2166136261; const s = salt + pw; for (let r = 0; r < 5000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return 'f1:' + h.toString(16);
  }
  const pub = (u) => (u ? { id: u.id, full_name: u.full_name, email: u.email, phone: u.phone, role: u.role, is_active: u.is_active, last_login: u.last_login, prefs: u.prefs || {} } : null);

  /* ---------- sessions ---------- */
  const readSess = () => { try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return null; } };
  const Auth = (PLP.Auth = {
    needsSetup: () => db().users.length === 0,
    current() {
      const s = readSess(); if (!s) return null;
      const u = db().users.find((x) => x.id === s.uid);
      const expired = Date.now() - s.last > 7 * DAY;
      const m = db().members.find((x) => x.user_id === s.uid);
      if (!u || !u.is_active || expired || (m && m.status === 'SUSPENDED')) { localStorage.removeItem(SKEY); if (u && expired) { audit(u.id, 'SESSION_EXPIRED', 'users', u.id, {}); save(); } return null; }
      if (Date.now() - s.last > 6e4) { s.last = Date.now(); localStorage.setItem(SKEY, JSON.stringify(s)); }
      return pub(u);
    },
    async setup(d) {
      if (!Auth.needsSetup()) throw err('FORBIDDEN', 'Setup is already complete.');
      const e = V.run({ full_name: [V.req('Full name'), V.min(3, 'Full name')], email: [V.req('Email'), V.email], password: [V.password] }, d);
      if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
      if (d.password !== d.confirm) throw err('VALIDATION', 'Passwords do not match.', { confirm: 'Passwords do not match' });
      const salt = U.uuid(), u = { id: U.uuid(), full_name: d.full_name.trim(), email: U.norm(d.email), phone: '', role: 'SUPER_ADMIN', is_active: true, last_login: null, salt, pass_hash: await hashPw(d.password, salt), created_at: U.now(), updated_at: U.now() };
      db().users.push(u); audit(u.id, 'SYSTEM_SETUP', 'users', u.id, { note: 'First SUPER_ADMIN created' }); save(); return pub(u);
    },
    async login(email, password) {
      const key = U.norm(email), att = JSON.parse(localStorage.getItem(AKEY) || '{}'), rec = (att[key] || []).filter((t) => Date.now() - t < 15 * 6e4);
      const generic = err('AUTH', 'Invalid email or password.');
      if (!key || !password) throw generic;
      if (rec.length >= 5) { audit(null, 'LOGIN_FAILED', 'users', null, { email_attempted: key, reason: 'RATE_LIMITED' }); save(); throw err('AUTH', 'Too many attempts. Please wait 15 minutes and try again.'); }
      const u = db().users.find((x) => x.email === key);
      let ok = false, reason = 'INVALID_CREDENTIALS';
      if (u && u.pass_hash) ok = (await hashPw(password, u.salt)) === u.pass_hash;
      const m = u && db().members.find((x) => x.user_id === u.id);
      if (ok && (!u.is_active || (m && m.status === 'SUSPENDED'))) { ok = false; reason = 'ACCOUNT_SUSPENDED'; }
      if (!ok) { rec.push(Date.now()); att[key] = rec; localStorage.setItem(AKEY, JSON.stringify(att)); audit(u ? u.id : null, 'LOGIN_FAILED', 'users', u ? u.id : null, { email_attempted: key, reason }); save(); throw generic; }
      delete att[key]; localStorage.setItem(AKEY, JSON.stringify(att));
      u.last_login = U.now(); audit(u.id, 'LOGIN_SUCCESS', 'users', u.id, { method: 'email_password' }); save();
      localStorage.setItem(SKEY, JSON.stringify({ uid: u.id, issued: Date.now(), last: Date.now() }));
      return pub(u);
    },
    logout() { const u = Auth.current(); if (u) { audit(u.id, 'LOGOUT', 'users', u.id, {}); save(); } localStorage.removeItem(SKEY); },
    requestReset(email) {
      const u = db().users.find((x) => x.email === U.norm(email));
      if (u && u.is_active) { const t = U.token(); db().resets.push({ token: t, user_id: u.id, kind: 'RESET', expires: Date.now() + 36e5 }); audit(u.id, 'PASSWORD_RESET_REQUESTED', 'users', u.id, {}); Email.queue('PASSWORD_RESET_LINK', u, { link: Email.link('reset?token=' + t) }); save(); }
      return true; /* never reveal whether the account exists */
    },
    resetInfo(token) { const r = db().resets.find((x) => x.token === token && x.expires > Date.now()); return r ? { kind: r.kind } : null; },
    async resetPassword(token, pw, confirm) {
      const r = db().resets.find((x) => x.token === token && x.expires > Date.now());
      if (!r) throw err('AUTH', 'This link is invalid or has expired. Please request a new one.');
      const e = V.run({ password: [V.password] }, { password: pw }); if (e.password) throw err('VALIDATION', e.password, e);
      if (pw !== confirm) throw err('VALIDATION', 'Passwords do not match.', { confirm: 'Passwords do not match' });
      const u = db().users.find((x) => x.id === r.user_id); u.salt = U.uuid(); u.pass_hash = await hashPw(pw, u.salt); u.updated_at = U.now();
      db().resets = db().resets.filter((x) => x.token !== token);
      audit(u.id, r.kind === 'WELCOME' ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RESET', 'users', u.id, {}); Email.queue('PASSWORD_RESET_CONFIRMATION', u, {}); save(); return true;
    },
    async changePassword(current, next, confirm) {
      const me = need(); const u = db().users.find((x) => x.id === me.id);
      if ((await hashPw(current || '', u.salt)) !== u.pass_hash) throw err('VALIDATION', 'Current password is incorrect.', { current: 'Current password is incorrect' });
      const e = V.run({ next: [V.password] }, { next }); if (e.next) throw err('VALIDATION', e.next, e);
      if (next !== confirm) throw err('VALIDATION', 'Passwords do not match.', { confirm: 'Passwords do not match' });
      u.salt = U.uuid(); u.pass_hash = await hashPw(next, u.salt); u.updated_at = U.now(); audit(u.id, 'PASSWORD_CHANGED', 'users', u.id, {}); Email.queue('PASSWORD_RESET_CONFIRMATION', u, {}); save();
    },
  });
  function need(perm) {
    const u = Auth.current(); if (!u) throw err('UNAUTH', 'Please sign in to continue.');
    if (perm && !can(u.role, perm)) { audit(u.id, 'ACCESS_DENIED', null, null, { permission: perm }); save(); throw err('FORBIDDEN', 'You do not have permission to do that.'); }
    return u;
  }
  const needMember = () => { const u = need(); if (u.role !== 'MEMBER') throw err('FORBIDDEN', 'Member portal is for members only.'); const m = db().members.find((x) => x.user_id === u.id); if (!m) throw err('FORBIDDEN', 'No member profile found.'); return { u, m }; };

  /* ---------- email service (templates + outbox + optional server endpoint) ---------- */
  const EMAILS = {
    APPLICATION_SUBMITTED: ['We received your application', 'Thank you for applying to PLP Chapter Gisenyi, {{name}}. Your application is now PENDING review by our membership committee. We will email you as soon as a decision is made.'],
    APPLICATION_APPROVED: ['Welcome to PLP Gisenyi', 'Welcome to PLP Gisenyi, your application is approved.'],
    APPLICATION_REJECTED: ['Update on your application', 'Thank you for your interest in PLP Chapter Gisenyi, {{name}}. After careful review, your application was not approved at this time. You are welcome to reach out to the chapter or apply again in the future.'],
    MEMBER_ACTIVATED: ['Your membership is active', 'Hello {{name}}, your PLP Chapter Gisenyi membership is active again. New status: ACTIVE. You can sign in and continue taking part in chapter activities.'],
    MEMBER_SUSPENDED: ['Your membership was suspended', 'Hello {{name}}, your PLP Chapter Gisenyi membership has been suspended. New status: SUSPENDED. Next step: please contact the chapter committee to discuss reinstatement.'],
    MEMBER_ROLE_CHANGED: ['Your role has changed', 'Hello {{name}}, your role in PLP Chapter Gisenyi has changed to {{role}}.'],
    PASSWORD_RESET_LINK: ['Reset your password', 'Hello {{name}}, we received a request to reset your password. The link below is valid for one hour. If you did not request this, you can ignore this email.'],
    PASSWORD_RESET_CONFIRMATION: ['Your password was updated', 'Hello {{name}}, your password was just changed. If this was not you, contact the chapter committee immediately.'],
    EVENT_REGISTRATION_CONFIRMATION: ['Event registration confirmed', 'Hello {{name}}, your registration for "{{event}}" is confirmed. We look forward to seeing you.'],
    EVENT_CANCELLATION_CONFIRMATION: ['Event registration cancelled', 'Hello {{name}}, your registration for "{{event}}" has been cancelled.'],
  };
  const Email = (PLP.Email = {
    EVENTS: Object.keys(EMAILS),
    link: (hash) => new URL('index.html#/' + hash, location.href).href.replace(/#\/.*/, '') + '#/' + hash,
    render(event, to, data) {
      const s = settings(), tpl = (s.email_templates || {})[event] || {}, def = EMAILS[event];
      const fill = (t) => String(t).replace(/\{\{(\w+)\}\}/g, (_, k) => ({ name: to.full_name || to.fullName || 'member', role: U.cap((data || {}).role || ''), event: (data || {}).event || '', status: (data || {}).status || '' }[k] || ''));
      const subject = 'PLP Chapter Gisenyi: ' + fill(tpl.subject || def[0]), body = fill(tpl.body || def[1]);
      const logo = new URL('public/plp-gisenyi-logo.svg', location.href).href, link = data && data.link;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><div style="background:${U.esc(s.brand_color)};padding:16px;text-align:center"><img src="${logo}" alt="PLP Chapter Gisenyi" width="72" height="72"/><h1 style="color:#fff;font-size:20px;margin:8px 0 0">${U.esc(s.chapter_name)}</h1></div><div style="padding:24px;color:#111827;line-height:1.6"><p>${U.esc(body)}</p>${link ? `<p><a href="${U.esc(link)}" style="background:${U.esc(s.brand_color)};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Continue</a></p><p style="font-size:12px;color:#6b7280;word-break:break-all">${U.esc(link)}</p>` : ''}<p style="margin-top:24px">Peace, love and unity,<br>${U.esc(s.chapter_name)}</p></div></div>`;
      return { subject, html, text: `${s.chapter_name}\n\n${body}${link ? '\n\n' + link : ''}\n\nPeace, love and unity,\n${s.chapter_name}` };
    },
    /* Called only AFTER the database change succeeded. Failures are logged and never throw. */
    queue(event, to, data) {
      const rec = { id: U.uuid(), event, to: to.email, subject: '', html: '', text: '', status: 'LOCAL', error: '', created_at: U.now() };
      try {
        const r = Email.render(event, to, data); Object.assign(rec, r);
        db().emails.push(rec);
        const url = (w.PLP_CONFIG || {}).emailEndpoint;
        if (url) { rec.status = 'PENDING'; fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: rec.to, subject: rec.subject, html: rec.html, text: rec.text }) }).then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); Email._done(rec.id, 'SENT', ''); }).catch((e) => Email._done(rec.id, 'FAILED', String(e.message || e))); }
        else audit(to.id || null, 'EMAIL_QUEUED_LOCAL', 'emails', rec.id, { event });
      } catch (e) { rec.status = 'FAILED'; rec.error = String(e.message || e); db().emails.push(rec); audit(to.id || null, 'EMAIL_FAILED', 'emails', rec.id, { event, error: rec.error }); }
    },
    _done(id, status, error) { const r = db().emails.find((x) => x.id === id); if (!r) return; r.status = status; r.error = error; audit(null, status === 'SENT' ? 'EMAIL_SENT' : 'EMAIL_FAILED', 'emails', id, { event: r.event, error }); save(); },
  });

  /* ---------- helpers ---------- */
  const effStatus = (e) => { if (e.status === 'CANCELLED' || e.status === 'COMPLETED') return e.status; const t = new Date(e.event_date).getTime(); if (Date.now() > t + 4 * 36e5) return 'COMPLETED'; if (Date.now() >= t) return 'ONGOING'; return 'UPCOMING'; };
  PLP.effStatus = effStatus;
  const nameOf = (id) => { const u = db().users.find((x) => x.id === id); return u ? u.full_name : id ? 'Unknown' : 'System'; };
  const memberOf = (uid) => db().members.find((x) => x.user_id === uid);
  const evOut = (e) => Object.assign({}, e, { eff_status: effStatus(e), organizer: nameOf(e.created_by), registered: db().event_registrations.filter((r) => r.event_id === e.id && r.attendance_status !== 'CANCELLED').length });
  const clean = (o, keys) => { const r = {}; keys.forEach((k) => { r[k] = typeof o[k] === 'string' ? o[k].trim() : o[k] == null ? '' : o[k]; }); return r; };

  /* ---------- public API ---------- */
  const API = (PLP.API = {});
  API.stats = () => { const d = db(), done = d.events.filter((e) => e.published && effStatus(e) === 'COMPLETED'); const vol = new Set(); d.event_registrations.forEach((r) => { const e = d.events.find((x) => x.id === r.event_id); if (r.attendance_status === 'ATTENDED' && e && e.category === 'Community Service') vol.add(r.member_id); }); return { members: d.members.filter((m) => m.status === 'ACTIVE').length, events: done.length, volunteers: vol.size, projects: done.filter((e) => e.category === 'Community Service').length }; };
  API.eventsPublic = () => db().events.filter((e) => e.published).map(evOut).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  API.event = (id) => { const e = db().events.find((x) => x.id === id); const u = Auth.current(); if (!e || (!e.published && !(u && can(u.role, 'events.manage')))) return null; return evOut(e); };
  API.newsPublic = () => db().news.filter((n) => n.published).map((n) => Object.assign({}, n, { author: nameOf(n.created_by) })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  API.newsItem = (id) => { const n = db().news.find((x) => x.id === id); const u = Auth.current(); if (!n || (!n.published && !(u && can(u.role, 'news.manage')))) return null; return Object.assign({}, n, { author: nameOf(n.created_by) }); };
  API.galleryPublic = () => db().gallery.map((g) => { const e = g.event_id && db().events.find((x) => x.id === g.event_id); return Object.assign({}, g, { album_name: e ? e.title : g.album || 'General' }); }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  API.eventOptions = () => db().events.map((e) => ({ id: e.id, title: e.title }));

  const APP_RULES = { full_name: [V.req('Full name'), V.min(3, 'Full name'), V.max(100, 'Full name')], email: [V.req('Email'), V.email], phone: [V.req('Phone number'), V.phone], date_of_birth: [V.req('Date of birth'), V.pastDate('Date of birth')], school: [V.req('School'), V.max(120, 'School')], graduation_year: [V.req('Graduation year'), V.year('Graduation year')], district: [V.req('District')], sector: [V.req('Sector')], cell: [V.req('Cell')], village: [V.req('Village')], occupation: [V.max(120, 'Occupation')], skills: [V.max(500, 'Skills')], motivation: [V.req('Motivation'), V.min(20, 'Motivation'), V.max(1500, 'Motivation')] };
  API.submitApplication = (d) => {
    const e = V.run(APP_RULES, d);
    if (!d.agreement_accepted) e.agreement_accepted = 'You must accept the Membership Agreement to apply';
    if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const em = U.norm(d.email), ph = U.normPhone(d.phone), D = db();
    const dup = D.applications.find((a) => a.status !== 'REJECTED' && (U.norm(a.email) === em || U.normPhone(a.phone) === ph));
    if (dup || D.users.some((u) => u.email === em) || D.members.some((m) => U.normPhone(m.phone) === ph && ph)) throw err('VALIDATION', 'An application or account already exists with this email or phone number.', { email: 'This email or phone is already registered' });
    const a = Object.assign({ id: U.uuid() }, clean(d, ['full_name', 'phone', 'date_of_birth', 'gender', 'school', 'district', 'sector', 'cell', 'village', 'occupation', 'skills', 'motivation']), { email: em, graduation_year: +d.graduation_year, agreement_accepted: true, agreement_accepted_at: U.now(), status: 'PENDING', reviewed_by: null, reviewed_at: null, review_notes: '', created_at: U.now(), updated_at: U.now() });
    D.applications.push(a); audit(null, 'APPLICATION_SUBMITTED', 'applications', a.id, { district: a.district }); Email.queue('APPLICATION_SUBMITTED', { full_name: a.full_name, email: a.email }, {}); save(); return { id: a.id };
  };
  const CONTACT_RULES = { name: [V.req('Name'), V.max(100, 'Name')], email: [V.req('Email'), V.email], subject: [V.max(150, 'Subject')], message: [V.req('Message'), V.min(10, 'Message'), V.max(3000, 'Message')] };
  API.submitContact = (d) => {
    const e = V.run(CONTACT_RULES, d); if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const em = U.norm(d.email); if (db().contacts.filter((c) => c.email === em && Date.now() - new Date(c.created_at) < 36e5).length >= 5) throw err('RATE', 'Too many messages. Please try again later.');
    db().contacts.push({ id: U.uuid(), name: d.name.trim(), email: em, subject: (d.subject || '').trim(), message: d.message.trim(), status: 'NEW', created_at: U.now() }); audit(null, 'CONTACT_RECEIVED', 'contacts', null, {}); save();
  };

  /* ---------- member API ---------- */
  API.myMember = () => { const { m } = needMember(); return Object.assign({}, m, { approver: nameOf((db().applications.find((a) => a.id === m.application_id) || {}).reviewed_by), approved_at: (db().applications.find((a) => a.id === m.application_id) || {}).reviewed_at }); };
  const myRegs = (mid) => db().event_registrations.filter((r) => r.member_id === mid);
  API.dashboard = () => {
    const { u, m } = needMember(), D = db(), regs = myRegs(m.id).filter((r) => r.attendance_status !== 'CANCELLED');
    const upcoming = D.events.filter((e) => e.published && effStatus(e) === 'UPCOMING').sort((a, b) => new Date(a.event_date) - new Date(b.event_date)).slice(0, 3).map((e) => Object.assign(evOut(e), { registered_by_me: regs.some((r) => r.event_id === e.id) }));
    const vol = regs.filter((r) => r.attendance_status === 'ATTENDED' && (D.events.find((e) => e.id === r.event_id) || {}).category === 'Community Service').length;
    return { member: m, stats: { joined: regs.filter((r) => r.attendance_status === 'ATTENDED').length, volunteer: vol, status: m.status, pending: regs.filter((r) => r.attendance_status === 'REGISTERED' && effStatus(D.events.find((e) => e.id === r.event_id) || { event_date: 0, status: 'COMPLETED' }) !== 'COMPLETED').length }, upcoming, announcements: API.myAnnouncements().slice(0, 3), activity: D.activity.filter((a) => a.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8) };
  };
  const PROFILE_RULES = { phone: [V.req('Phone number'), V.phone], school: [V.max(120, 'School')], graduation_year: [V.year('Graduation year')], occupation: [V.max(120, 'Occupation')], skills: [V.max(500, 'Skills')] };
  API.updateProfile = (d) => {
    const { u, m } = needMember(); const e = V.run(PROFILE_RULES, d); if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const ph = U.normPhone(d.phone); if (db().members.some((x) => x.id !== m.id && U.normPhone(x.phone) === ph)) throw err('VALIDATION', 'That phone number is already used by another member.', { phone: 'Phone number already in use' });
    const keys = ['phone', 'school', 'district', 'sector', 'cell', 'village', 'occupation', 'skills', 'profile_image'], changed = [];
    keys.forEach((k) => { if (d[k] !== undefined && String(d[k] || '') !== String(m[k] || '')) { m[k] = d[k]; changed.push(k); } });
    if (d.graduation_year !== undefined && +d.graduation_year !== +m.graduation_year) { m.graduation_year = d.graduation_year === '' ? null : +d.graduation_year; changed.push('graduation_year'); }
    if (!changed.length) return m;
    m.updated_at = U.now(); const user = db().users.find((x) => x.id === u.id); user.phone = m.phone; user.updated_at = U.now();
    audit(u.id, 'PROFILE_UPDATED', 'members', m.id, { fields: changed }); track(u.id, 'PROFILE', 'You updated your profile'); save(); return m;
  };
  API.setPrefs = (prefs) => { const u = need(); const user = db().users.find((x) => x.id === u.id); user.prefs = Object.assign({}, user.prefs, prefs); save(); };
  API.myEvents = () => { const { m } = needMember(); const regs = myRegs(m.id); return API.eventsPublic().map((e) => Object.assign(e, { reg: regs.find((r) => r.event_id === e.id && r.attendance_status !== 'CANCELLED') || null })); };
  API.registerEvent = (eventId) => {
    const { u, m } = needMember(), e = db().events.find((x) => x.id === eventId);
    if (!e || !e.published) throw err('NOTFOUND', 'Event not found.');
    if (m.status !== 'ACTIVE') throw err('FORBIDDEN', 'Only active members can register.');
    if (!['UPCOMING', 'ONGOING'].includes(effStatus(e))) throw err('VALIDATION', 'Registration is closed for this event.');
    const ex = db().event_registrations.find((r) => r.event_id === eventId && r.member_id === m.id);
    if (ex && ex.attendance_status !== 'CANCELLED') throw err('DUPLICATE', 'You are already registered for this event.');
    let reg = ex; if (ex) { ex.attendance_status = 'REGISTERED'; ex.created_at = U.now(); } else { reg = { id: U.uuid(), event_id: eventId, member_id: m.id, attendance_status: 'REGISTERED', created_at: U.now() }; db().event_registrations.push(reg); }
    audit(u.id, 'EVENT_REGISTRATION_CREATED', 'event_registrations', reg.id, { event_id: eventId }); track(u.id, 'EVENT', `You registered for "${e.title}"`);
    Email.queue('EVENT_REGISTRATION_CONFIRMATION', u, { event: e.title }); save(); return reg;
  };
  API.cancelRegistration = (eventId) => {
    const { u, m } = needMember(), e = db().events.find((x) => x.id === eventId), r = db().event_registrations.find((x) => x.event_id === eventId && x.member_id === m.id && x.attendance_status === 'REGISTERED');
    if (!r || !e) throw err('NOTFOUND', 'No active registration found.');
    if (effStatus(e) === 'COMPLETED') throw err('VALIDATION', 'This event has already finished.');
    r.attendance_status = 'CANCELLED'; audit(u.id, 'EVENT_REGISTRATION_CANCELLED', 'event_registrations', r.id, { event_id: eventId }); track(u.id, 'EVENT', `You cancelled your registration for "${e.title}"`);
    Email.queue('EVENT_CANCELLATION_CONFIRMATION', u, { event: e.title }); save();
  };
  API.history = () => { const { m } = needMember(); return myRegs(m.id).filter((r) => r.attendance_status !== 'CANCELLED').map((r) => { const e = db().events.find((x) => x.id === r.event_id); if (!e) return null; const done = effStatus(e) === 'COMPLETED'; return { id: r.id, event: e.title, date: e.event_date, category: e.category, status: r.attendance_status === 'ATTENDED' ? 'Attended' : r.attendance_status === 'ABSENT' || (done && r.attendance_status === 'REGISTERED') ? 'Missed' : 'Registered' }; }).filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date)); };
  API.myNotifications = () => { const u = need(); return db().notifications.filter((n) => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)); };
  API.markNotification = (id) => { const u = need(); db().notifications.forEach((n) => { if (n.user_id === u.id && (!id || n.id === id)) n.read = true; }); save(); };
  API.unreadCount = () => { const u = Auth.current(); return u ? db().notifications.filter((n) => n.user_id === u.id && !n.read).length : 0; };
  API.myAnnouncements = () => { const u = need(), m = memberOf(u.id), D = db(); return D.announcements.filter((a) => a.audience === 'ALL' || (a.audience === 'DISTRICT' && m && m.district === a.audience_value) || (a.audience === 'EVENT' && m && D.event_registrations.some((r) => r.event_id === a.audience_value && r.member_id === m.id && r.attendance_status !== 'CANCELLED')) || can(u.role, 'announce.send')).map((a) => Object.assign({}, a, { read: D.announcement_reads.some((r) => r.announcement_id === a.id && r.user_id === u.id), author: nameOf(a.created_by) })).sort((a, b) => b.created_at.localeCompare(a.created_at)); };
  API.markAnnouncementRead = (id) => { const u = need(); if (!db().announcement_reads.some((r) => r.announcement_id === id && r.user_id === u.id)) { db().announcement_reads.push({ announcement_id: id, user_id: u.id }); save(); } };

  /* ---------- admin: overview ---------- */
  API.overview = () => {
    const u = need(); if (!isAdminRole(u.role)) throw err('FORBIDDEN', 'Admin only.'); const D = db(), o = { role: u.role };
    o.events_upcoming = D.events.filter((e) => effStatus(e) === 'UPCOMING').length; o.events_completed = D.events.filter((e) => effStatus(e) === 'COMPLETED').length;
    if (can(u.role, 'members.view')) o.members = D.members.length;
    if (can(u.role, 'applications.view')) { ['PENDING', 'APPROVED', 'REJECTED'].forEach((s) => { o['apps_' + s] = D.applications.filter((a) => a.status === s).length; }); }
    if (can(u.role, 'news.manage')) o.news = D.news.length;
    if (can(u.role, 'messages.manage')) o.messages_new = D.contacts.filter((c) => c.status === 'NEW').length;
    if (u.role !== 'TREASURER') {
      const since = Date.now() - DAY, rec = D.audit_logs.filter((l) => Date.now() - new Date(l.created_at) < 7 * DAY);
      o.activity_24h = D.audit_logs.filter((l) => new Date(l.created_at).getTime() > since).length; o.logins_7d = rec.filter((l) => l.action === 'LOGIN_SUCCESS').length;
      const FEED = ['APPLICATION_SUBMITTED', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'EVENT_CREATED', 'NEWS_PUBLISHED', 'MEMBER_SUSPENDED', 'GALLERY_MEDIA_UPLOADED'];
      o.feed = D.audit_logs.filter((l) => FEED.includes(l.action)).slice(-10).reverse().map((l) => ({ action: l.action, actor: l.user_id ? nameOf(l.user_id) : 'Applicant', at: l.created_at }));
    }
    return o;
  };

  /* ---------- admin: applications ---------- */
  API.applications = () => { need('applications.view'); return db().applications.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)); };
  const memberId = () => { const c = ++db().counters.member; return `PLP-GSY-${new Date().getFullYear()}-${String(c).padStart(4, '0')}`; };
  API.approveApplication = (id) => {
    const me = need('applications.decide'), D = db(), a = D.applications.find((x) => x.id === id);
    if (!a) throw err('NOTFOUND', 'Application not found.'); if (a.status !== 'PENDING') throw err('VALIDATION', 'This application was already reviewed.');
    let user = D.users.find((x) => x.email === a.email);
    if (!user) { user = { id: U.uuid(), full_name: a.full_name, email: a.email, phone: a.phone, role: 'MEMBER', is_active: true, last_login: null, salt: '', pass_hash: null, created_at: U.now(), updated_at: U.now() }; D.users.push(user); }
    if (D.members.some((m) => m.user_id === user.id)) throw err('VALIDATION', 'This person is already a member.');
    const m = Object.assign({ id: U.uuid(), user_id: user.id, application_id: a.id, membership_id: memberId() }, clean(a, ['full_name', 'gender', 'date_of_birth', 'phone', 'email', 'school', 'district', 'sector', 'cell', 'village', 'occupation', 'skills']), { graduation_year: a.graduation_year, profile_image: '', status: 'ACTIVE', join_date: U.now(), created_at: U.now(), updated_at: U.now() });
    D.members.push(m); a.status = 'APPROVED'; a.reviewed_by = me.id; a.reviewed_at = U.now(); a.updated_at = U.now();
    audit(me.id, 'APPLICATION_APPROVED', 'applications', a.id, { approved_by: me.id, membership_id: m.membership_id }); audit(me.id, 'MEMBER_CREATED', 'members', m.id, { membership_id: m.membership_id });
    const t = U.token(); D.resets.push({ token: t, user_id: user.id, kind: 'WELCOME', expires: Date.now() + 7 * DAY });
    notify(user.id, 'MEMBERSHIP', 'Welcome to PLP Gisenyi', `Your membership ID is ${m.membership_id}.`);
    save(); Email.queue('APPLICATION_APPROVED', user, { link: Email.link('reset?token=' + t) }); save(); return m;
  };
  API.rejectApplication = (id, reason) => {
    const me = need('applications.decide'), a = db().applications.find((x) => x.id === id);
    if (!a) throw err('NOTFOUND', 'Application not found.'); if (a.status !== 'PENDING') throw err('VALIDATION', 'This application was already reviewed.');
    if (!reason || reason.trim().length < 5) throw err('VALIDATION', 'Please give a reason (at least 5 characters).', { reason: 'A reason is required' });
    a.status = 'REJECTED'; a.reviewed_by = me.id; a.reviewed_at = U.now(); a.review_notes = reason.trim(); a.updated_at = U.now();
    audit(me.id, 'APPLICATION_REJECTED', 'applications', a.id, { rejected_by: me.id }); save(); Email.queue('APPLICATION_REJECTED', { full_name: a.full_name, email: a.email }, {}); save();
  };

  /* ---------- admin: members ---------- */
  API.members = () => { need('members.view'); return db().members.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)); };
  API.updateMember = (id, d) => {
    const me = need('members.edit'), m = db().members.find((x) => x.id === id); if (!m) throw err('NOTFOUND', 'Member not found.');
    const e = V.run({ full_name: [V.req('Full name'), V.min(3, 'Full name')], phone: [V.req('Phone'), V.phone], school: [V.max(120, 'School')], graduation_year: [V.year('Graduation year')] }, d); if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    if (db().members.some((x) => x.id !== id && U.normPhone(x.phone) === U.normPhone(d.phone))) throw err('VALIDATION', 'Phone already used by another member.', { phone: 'Phone number already in use' });
    const changed = []; ['full_name', 'phone', 'school', 'district', 'sector', 'cell', 'village', 'occupation', 'skills', 'gender'].forEach((k) => { if (d[k] !== undefined && String(d[k]) !== String(m[k] || '')) { m[k] = String(d[k]).trim(); changed.push(k); } });
    if (d.graduation_year !== undefined && +d.graduation_year !== +m.graduation_year) { m.graduation_year = d.graduation_year === '' ? null : +d.graduation_year; changed.push('graduation_year'); }
    const u = db().users.find((x) => x.id === m.user_id); if (u) { u.full_name = m.full_name; u.phone = m.phone; }
    m.updated_at = U.now(); audit(me.id, 'MEMBER_UPDATED', 'members', m.id, { fields: changed }); save();
  };
  API.setMemberStatus = (id, status, reason) => {
    const me = need('members.edit'), m = db().members.find((x) => x.id === id); if (!m) throw err('NOTFOUND', 'Member not found.');
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw err('VALIDATION', 'Invalid status.'); if (m.status === status) return;
    if (status === 'SUSPENDED' && (!reason || reason.trim().length < 5)) throw err('VALIDATION', 'Please give a reason for suspension.', { reason: 'A reason is required' });
    const u = db().users.find((x) => x.id === m.user_id); if (u && u.role !== 'MEMBER' && me.role !== 'SUPER_ADMIN') throw err('FORBIDDEN', 'Only a SUPER_ADMIN can suspend committee members.');
    m.status = status; m.updated_at = U.now(); audit(me.id, status === 'SUSPENDED' ? 'MEMBER_SUSPENDED' : 'MEMBER_REACTIVATED', 'members', m.id, { reason: reason || '' });
    if (u) notify(u.id, 'MEMBERSHIP', status === 'SUSPENDED' ? 'Membership suspended' : 'Membership reactivated', 'Your membership status is now ' + status + '.'); save();
    if (u) { Email.queue(status === 'SUSPENDED' ? 'MEMBER_SUSPENDED' : 'MEMBER_ACTIVATED', u, { status }); save(); }
  };

  /* ---------- admin: events ---------- */
  API.eventsAdmin = () => { need('events.manage'); return db().events.map(evOut).sort((a, b) => new Date(b.event_date) - new Date(a.event_date)); };
  const EV_RULES = { title: [V.req('Title'), V.min(3, 'Title'), V.max(150, 'Title')], event_date: [V.req('Date & time'), V.futureOk('Date & time')], description: [V.max(5000, 'Description')], location: [V.max(200, 'Location')], status: [V.oneOf(['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'], 'Status')] };
  API.CATEGORIES = ['Community Service', 'Leadership Training', 'Peacebuilding', 'Meeting', 'Campaign', 'Other'];
  API.saveEvent = (d) => {
    const me = need('events.manage'), e = V.run(EV_RULES, d); if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const f = Object.assign(clean(d, ['title', 'description', 'location', 'category', 'requirements', 'image']), { event_date: new Date(d.event_date).toISOString(), status: d.status || 'UPCOMING', published: !!d.published });
    if (!API.CATEGORIES.includes(f.category)) f.category = 'Other';
    if (d.id) {
      const ev = db().events.find((x) => x.id === d.id); if (!ev) throw err('NOTFOUND', 'Event not found.');
      if (effStatus(ev) === 'COMPLETED' && !can(me.role, 'events.overridePast')) throw err('FORBIDDEN', 'Past events can only be edited by the Chapter Leader or a Super Admin.');
      Object.assign(ev, f, { updated_at: U.now() }); audit(me.id, 'EVENT_UPDATED', 'events', ev.id, { title: ev.title }); save(); return ev;
    }
    const ev = Object.assign({ id: U.uuid(), created_by: me.id, created_at: U.now(), updated_at: U.now() }, f); db().events.push(ev); audit(me.id, 'EVENT_CREATED', 'events', ev.id, { title: ev.title, published: ev.published }); save(); return ev;
  };
  API.setEventPublished = (id, p) => { const me = need('events.manage'), ev = db().events.find((x) => x.id === id); if (!ev) throw err('NOTFOUND', 'Event not found.'); ev.published = !!p; ev.updated_at = U.now(); audit(me.id, 'EVENT_UPDATED', 'events', id, { published: !!p }); save(); };
  API.deleteEvent = (id) => { const me = need('events.manage'), D = db(), ev = D.events.find((x) => x.id === id); if (!ev) throw err('NOTFOUND', 'Event not found.'); D.events = D.events.filter((x) => x.id !== id); D.event_registrations = D.event_registrations.filter((r) => r.event_id !== id); D.gallery.forEach((g) => { if (g.event_id === id) { g.event_id = null; g.album = ev.title; } }); audit(me.id, 'EVENT_DELETED', 'events', id, { title: ev.title }); save(); };
  API.registrations = (eventId) => { need('events.manage'); const D = db(); return D.event_registrations.filter((r) => r.event_id === eventId && r.attendance_status !== 'CANCELLED').map((r) => { const m = D.members.find((x) => x.id === r.member_id) || {}; return { id: r.id, name: m.full_name, membership_id: m.membership_id, district: m.district, phone: m.phone, status: r.attendance_status, registered_at: r.created_at }; }); };
  API.markAttendance = (regId, status) => { const me = need('events.manage'); if (!['REGISTERED', 'ATTENDED', 'ABSENT'].includes(status)) throw err('VALIDATION', 'Invalid status.'); const r = db().event_registrations.find((x) => x.id === regId); if (!r) throw err('NOTFOUND', 'Registration not found.'); r.attendance_status = status; audit(me.id, 'EVENT_ATTENDANCE_MARKED', 'event_registrations', regId, { status }); const m = db().members.find((x) => x.id === r.member_id); if (m) track(m.user_id, 'ATTENDANCE', `Attendance recorded: ${status.toLowerCase()}`); save(); };

  /* ---------- admin: news ---------- */
  API.newsAdmin = () => { need('news.manage'); return db().news.map((n) => Object.assign({}, n, { author: nameOf(n.created_by) })).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); };
  API.saveNews = (d) => {
    const me = need('news.manage'), e = V.run({ title: [V.req('Title'), V.min(3, 'Title'), V.max(150, 'Title')], content: [V.req('Content')] }, { title: d.title, content: U.excerpt(d.content, 99999) }); if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const content = U.sanitizeHtml(d.content); if (content.length > 50000) throw err('VALIDATION', 'Content is too long.', { content: 'Content is too long' });
    if (d.id) {
      const n = db().news.find((x) => x.id === d.id); if (!n) throw err('NOTFOUND', 'Article not found.'); const was = n.published;
      Object.assign(n, { title: d.title.trim(), content, image: d.image || '', published: !!d.published, updated_at: U.now() });
      if (n.published && !was) audit(me.id, 'NEWS_PUBLISHED', 'news', n.id, { title: n.title }); else audit(me.id, 'NEWS_UPDATED', 'news', n.id, { title: n.title, published: n.published }); save(); return n;
    }
    const n = { id: U.uuid(), title: d.title.trim(), content, image: d.image || '', published: !!d.published, created_by: me.id, created_at: U.now(), updated_at: U.now() }; db().news.push(n);
    audit(me.id, 'NEWS_CREATED', 'news', n.id, { title: n.title }); if (n.published) audit(me.id, 'NEWS_PUBLISHED', 'news', n.id, { title: n.title }); save(); return n;
  };
  API.setNewsPublished = (id, p) => { const me = need('news.manage'), n = db().news.find((x) => x.id === id); if (!n) throw err('NOTFOUND', 'Article not found.'); n.published = !!p; n.updated_at = U.now(); audit(me.id, p ? 'NEWS_PUBLISHED' : 'NEWS_UPDATED', 'news', id, { title: n.title, published: !!p }); save(); };
  API.deleteNews = (id) => { const me = need('news.delete'), n = db().news.find((x) => x.id === id); if (!n) throw err('NOTFOUND', 'Article not found.'); db().news = db().news.filter((x) => x.id !== id); audit(me.id, 'NEWS_DELETED', 'news', id, { title: n.title }); save(); };

  /* ---------- admin: gallery ---------- */
  API.addGallery = (d) => { const me = need('gallery.manage'); if (!d.media_url) throw err('VALIDATION', 'Choose a file.'); if (!['image', 'video'].includes(d.media_type)) throw err('VALIDATION', 'Invalid media type.'); const g = { id: U.uuid(), title: (d.title || '').trim().slice(0, 150), description: (d.description || '').trim().slice(0, 500), media_url: d.media_url, media_type: d.media_type, event_id: d.event_id || null, album: (d.album || '').trim().slice(0, 80), uploaded_by: me.id, created_at: U.now() }; db().gallery.push(g); audit(me.id, 'GALLERY_MEDIA_UPLOADED', 'gallery', g.id, { media_type: g.media_type }); save(); return g; };
  API.deleteGallery = (id) => { const me = need('gallery.manage'), g = db().gallery.find((x) => x.id === id); if (!g) throw err('NOTFOUND', 'Media not found.'); db().gallery = db().gallery.filter((x) => x.id !== id); audit(me.id, 'GALLERY_MEDIA_DELETED', 'gallery', id, {}); save(); return g.media_url; };

  /* ---------- admin: messages ---------- */
  API.messages = () => { need('messages.manage'); return db().contacts.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)); };
  API.setMessageStatus = (id, s) => { need('messages.manage'); if (!['NEW', 'READ', 'ARCHIVED'].includes(s)) throw err('VALIDATION', 'Invalid status.'); const c = db().contacts.find((x) => x.id === id); if (c) { c.status = s; save(); } };

  /* ---------- admin: announcements ---------- */
  API.sentAnnouncements = () => { need('announce.send'); return db().announcements.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)); };
  API.sendAnnouncement = (d) => {
    const me = need('announce.send'), e = V.run({ title: [V.req('Title'), V.max(120, 'Title')], body: [V.req('Message'), V.max(2000, 'Message')], priority: [V.oneOf(['HIGH', 'NORMAL'], 'Priority')], audience: [V.oneOf(['ALL', 'DISTRICT', 'EVENT'], 'Audience')] }, d);
    if (d.audience !== 'ALL' && !d.audience_value) e.audience_value = 'Choose a target'; if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const D = db(); let targets = D.members.filter((m) => m.status === 'ACTIVE');
    if (d.audience === 'DISTRICT') targets = targets.filter((m) => m.district === d.audience_value); if (d.audience === 'EVENT') { const ids = new Set(D.event_registrations.filter((r) => r.event_id === d.audience_value && r.attendance_status !== 'CANCELLED').map((r) => r.member_id)); targets = targets.filter((m) => ids.has(m.id)); }
    const a = { id: U.uuid(), title: d.title.trim(), body: d.body.trim(), priority: d.priority, audience: d.audience, audience_value: d.audience === 'ALL' ? '' : d.audience_value, recipients: targets.length, created_by: me.id, created_at: U.now() };
    D.announcements.push(a); targets.forEach((m) => notify(m.user_id, 'ANNOUNCEMENT', a.title, a.body)); audit(me.id, 'ANNOUNCEMENT_SENT', 'announcements', a.id, { audience: a.audience, recipients: a.recipients }); save(); return a;
  };

  /* ---------- admin: reports ---------- */
  API.report = (from, to) => {
    const me = need('reports.view'), D = db(), f = from ? new Date(from).getTime() : 0, t = to ? new Date(to).getTime() + DAY - 1 : Infinity, inR = (iso) => { const x = new Date(iso).getTime(); return x >= f && x <= t; };
    const count = (arr, fn) => { const o = {}; arr.forEach((x) => { const k = fn(x) || 'Unknown'; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
    const mem = D.members.filter((m) => inR(m.join_date)), apps = D.applications.filter((a) => inR(a.created_at));
    const monthKey = (iso) => iso.slice(0, 7);
    const intake = count(apps, (a) => monthKey(a.created_at)).sort((a, b) => a.label.localeCompare(b.label));
    const events = D.events.filter((e) => inR(e.event_date)).map((e) => { const regs = D.event_registrations.filter((r) => r.event_id === e.id && r.attendance_status !== 'CANCELLED'), att = regs.filter((r) => r.attendance_status === 'ATTENDED').length; return { title: e.title, date: e.event_date, status: effStatus(e), registered: regs.length, attended: att, rate: regs.length ? Math.round((att / regs.length) * 100) : 0 }; }).sort((a, b) => new Date(b.date) - new Date(a.date));
    const active = {}; D.event_registrations.filter((r) => r.attendance_status === 'ATTENDED' && inR(r.created_at)).forEach((r) => { active[r.member_id] = (active[r.member_id] || 0) + 1; });
    const top = Object.entries(active).map(([id, n]) => ({ label: (D.members.find((m) => m.id === id) || {}).full_name || 'Unknown', value: n })).sort((a, b) => b.value - a.value).slice(0, 5);
    const logs = D.audit_logs.filter((l) => inR(l.created_at)), adminAct = count(logs.filter((l) => l.user_id && !['LOGIN_SUCCESS', 'LOGOUT', 'LOGIN_FAILED', 'ACCESS_DENIED', 'SESSION_EXPIRED'].includes(l.action)), (l) => l.action).slice(0, 8);
    audit(me.id, 'REPORT_GENERATED', 'reports', null, { from: from || null, to: to || null }); save();
    return { members_total: mem.length, by_district: count(mem, (m) => m.district), by_year: count(mem, (m) => String(m.graduation_year || '')).sort((a, b) => a.label.localeCompare(b.label)), by_status: count(mem, (m) => m.status), apps_status: count(apps, (a) => a.status), intake, events, top, logins: logs.filter((l) => l.action === 'LOGIN_SUCCESS').length, failed_logins: logs.filter((l) => l.action === 'LOGIN_FAILED').length, admin_activity: adminAct, audit_total: logs.length };
  };

  /* ---------- admin: audit, roles, settings, emails ---------- */
  API.auditLogs = () => { need('audit.view'); return db().audit_logs.slice().reverse().map((l) => Object.assign({}, l, { user_name: l.user_id ? nameOf(l.user_id) : 'System / anonymous', user_role: ((db().users.find((u) => u.id === l.user_id)) || {}).role || '' })); };
  API.logAuditExport = (n) => { const me = need('audit.view'); audit(me.id, 'AUDIT_LOGS_EXPORTED', 'audit_logs', null, { rows: n }); save(); };
  API.users = () => { need('roles.manage'); return db().users.map(pub); };
  API.setRole = (userId, role) => {
    const me = need('roles.manage'), u = db().users.find((x) => x.id === userId); if (!u) throw err('NOTFOUND', 'User not found.'); if (!ROLES.includes(role)) throw err('VALIDATION', 'Invalid role.');
    if (u.role === role) return; if (u.role === 'SUPER_ADMIN' && db().users.filter((x) => x.role === 'SUPER_ADMIN' && x.is_active).length <= 1) throw err('VALIDATION', 'You cannot remove the last SUPER_ADMIN.');
    const old = u.role; u.role = role; u.updated_at = U.now(); audit(me.id, 'ROLE_CHANGED', 'users', u.id, { from: old, to: role }); notify(u.id, 'ROLE', 'Your role changed', 'Your role is now ' + U.cap(role) + '.'); save(); Email.queue('MEMBER_ROLE_CHANGED', u, { role }); save();
  };
  API.saveSettings = (d) => {
    const me = need('settings.manage'), e = V.run({ chapter_name: [V.req('Chapter name'), V.max(80, 'Chapter name')], contact_email: [V.email], contact_phone: [V.phone], monthly_fee: [(v) => (v && !/^\d{1,9}$/.test(v) ? 'Enter whole numbers only' : '')] }, d);
    ['facebook', 'instagram', 'twitter', 'youtube', 'parent_url'].forEach((k) => { if (d[k] && !/^https?:\/\/\S+$/i.test(d[k])) e[k] = 'Enter a full link starting with http:// or https://'; });
    if (!/^#[0-9a-f]{6}$/i.test(d.brand_color || '')) e.brand_color = 'Choose a valid color'; else { const c = parseInt(d.brand_color.slice(1), 16), ch = [c >> 16, (c >> 8) & 255, c & 255].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }), L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; if (1.05 / (L + 0.05) < 4.5) e.brand_color = 'Too light for readable white text (WCAG needs 4.5:1). Pick a darker color.'; }
    if (Object.keys(e).length) throw err('VALIDATION', 'Please fix the highlighted fields.', e);
    const keys = ['chapter_name', 'contact_email', 'contact_phone', 'address', 'facebook', 'instagram', 'twitter', 'youtube', 'parent_url', 'monthly_fee', 'fee_rules', 'membership_rules', 'brand_color', 'logo_ref'], s = db().settings, ch = [];
    keys.forEach((k) => { if (d[k] !== undefined && String(d[k]) !== String(s[k] == null ? DEFAULT_SETTINGS[k] : s[k])) { s[k] = String(d[k]).trim(); ch.push(k); } });
    if (d.email_templates) { s.email_templates = d.email_templates; ch.push('email_templates'); }
    audit(me.id, 'SETTINGS_UPDATED', 'settings', null, { fields: ch }); save();
  };
  API.emails = () => { need('emails.view'); return db().emails.slice().reverse(); };
  API.retryEmail = (id) => { const me = need('emails.view'), r = db().emails.find((x) => x.id === id); const url = (w.PLP_CONFIG || {}).emailEndpoint; if (!r) throw err('NOTFOUND', 'Email not found.'); if (!url) throw err('VALIDATION', 'No email endpoint configured (see js/config.js).'); r.status = 'PENDING'; audit(me.id, 'EMAIL_RETRY', 'emails', id, {}); save(); fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: r.to, subject: r.subject, html: r.html, text: r.text }) }).then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); Email._done(id, 'SENT', ''); }).catch((e) => Email._done(id, 'FAILED', String(e.message || e))); };

  /* ---------- media store (IndexedDB) ---------- */
  const idbOpen = () => new Promise((res, rej) => { if (!w.indexedDB) return rej(err('STORAGE', 'This browser does not support media storage.')); const r = indexedDB.open('plp_gisenyi_media', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(err('STORAGE', 'Media storage is unavailable.')); });
  const idbRun = (mode, fn) => idbOpen().then((d) => new Promise((res, rej) => { const tx = d.transaction('blobs', mode), rq = fn(tx.objectStore('blobs')); tx.oncomplete = () => res(rq && rq.result); tx.onerror = () => rej(err('STORAGE', 'Media storage error.')); }));
  const urlCache = {};
  const Media = (PLP.media = {
    LIMITS: { image: 10 * 1048576, video: 100 * 1048576 }, TYPES: { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'video/mp4': 'video' },
    validate(file, kinds) { const k = Media.TYPES[file.type]; if (!k || !kinds.includes(k)) throw err('VALIDATION', `"${file.name}": unsupported type. Allowed: ${kinds.includes('video') ? 'JPG, PNG, WEBP, MP4' : 'JPG, PNG, WEBP'}.`); if (file.size > Media.LIMITS[k]) throw err('VALIDATION', `"${file.name}" is too large (max ${k === 'image' ? '10MB' : '100MB'}).`); return k; },
    async compress(file) { if (!/^image\/(jpeg|webp)$/.test(file.type)) return file; try { const bmp = await createImageBitmap(file), sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); const b = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82)); return b && b.size < file.size ? b : file; } catch (e) { return file; } },
    async put(file, kinds) { const k = Media.validate(file, kinds); const blob = k === 'image' ? await Media.compress(file) : file; const id = U.uuid(); await idbRun('readwrite', (s) => s.put(blob, id)); return { ref: 'idb:' + id, type: k, name: id + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4' }[blob.type || file.type] || '') }; },
    async url(ref) { if (!ref) return ''; if (!ref.startsWith('idb:')) return /^https:/.test(ref) ? ref : ''; if (urlCache[ref]) return urlCache[ref]; const blob = await idbRun('readonly', (s) => s.get(ref.slice(4))); if (!blob) return ''; return (urlCache[ref] = URL.createObjectURL(blob)); },
    del(ref) { return ref && ref.startsWith('idb:') ? idbRun('readwrite', (s) => s.delete(ref.slice(4))).then(() => { delete urlCache[ref]; }).catch(() => {}) : Promise.resolve(); },
    hydrate(root) { U.$$('[data-media]', root || document).forEach(async (el) => { const ref = el.getAttribute('data-media'); if (!ref || el.getAttribute('data-hydrated') === ref) return; el.setAttribute('data-hydrated', ref); try { const u = await Media.url(ref); if (!u) { el.classList.add('media-missing'); return; } if (el.tagName === 'IMG' || el.tagName === 'VIDEO') el.src = u; else el.style.backgroundImage = `url("${u}")`; } catch (e) { el.classList.add('media-missing'); } }); },
  });
})(window);
