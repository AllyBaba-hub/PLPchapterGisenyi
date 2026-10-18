/* PLP Chapter Gisenyi - UI shell: router, layouts, modals, toasts */
(function (w) {
  'use strict';
  const PLP = w.PLP, U = PLP.U, API = PLP.API, Auth = PLP.Auth, can = PLP.RBAC.can, esc = U.esc;
  const UI = (PLP.UI = {});
  const handlers = {}, forms = {}, inputs = {}, routes = [];
  let state = { user: null, cleanup: null };
  UI.on = (n, f) => { handlers[n] = f; }; UI.form = (n, f) => { forms[n] = f; }; UI.input = (n, f) => { inputs[n] = f; };
  UI.route = (pattern, opts) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'); routes.push(Object.assign({ re, keys, guard: 'public', layout: 'public' }, opts)); };
  UI.go = (p) => { location.hash = '#' + p; };
  UI.user = () => state.user;
  UI.refresh = () => dispatch(true);
  UI.root = () => U.$('#app');

  /* ---------- feedback ---------- */
  UI.toast = (msg, type = 'ok') => { const box = U.$('#toasts'), t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; t.setAttribute('role', type === 'err' ? 'alert' : 'status'); box.appendChild(t); setTimeout(() => t.remove(), type === 'err' ? 7000 : 4500); };
  UI.fail = (e) => {
    if (e && e.code === 'UNAUTH') { UI.toast('Please sign in to continue.', 'err'); UI.go('/login?next=' + encodeURIComponent(location.hash.slice(1))); return; }
    if (e && e.code) { UI.toast(e.message, 'err'); return; }
    console.error(e); UI.toast('Something went wrong. Please try again.', 'err');
  };
  UI.modal = ({ title, body, wide }) => {
    const prev = document.activeElement, bd = document.createElement('div'); bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="modal-head"><h2 id="mt">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close dialog">&times;</button></div><div class="modal-body">${body}</div></div>`;
    document.body.appendChild(bd); document.body.classList.add('noscroll');
    const close = () => { bd.remove(); if (!U.$('.modal-backdrop')) document.body.classList.remove('noscroll'); if (prev && prev.focus) prev.focus(); };
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-close]')) close(); });
    bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Tab') { const f = U.$$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[contenteditable=true]', bd); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } });
    PLP.media.hydrate(bd); const first = U.$('input,select,textarea,button:not([data-close])', bd.querySelector('.modal-body')); (first || U.$('[data-close]', bd)).focus();
    return { el: bd, close };
  };
  UI.confirm = ({ title, message, confirmText = 'Confirm', danger, input }) => new Promise((resolve) => {
    const m = UI.modal({ title, body: `<p>${esc(message)}</p>${input ? `<div class="field"><label for="cin">${esc(input)}</label><textarea id="cin" rows="3" maxlength="500"></textarea></div>` : ''}<div class="actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cok">${esc(confirmText)}</button></div>` });
    let done = false; const fin = (v) => { if (done) return; done = true; resolve(v); };
    U.$('#cok', m.el).onclick = () => { const v = input ? U.$('#cin', m.el).value.trim() : ''; if (input && v.length < 5) { U.showErrors(U.$('.modal-body', m.el), {}); const f = U.$('.field', m.el); if (!U.$('.field-error', f)) { const p = document.createElement('p'); p.className = 'field-error'; p.setAttribute('role', 'alert'); p.textContent = 'Please enter a reason (at least 5 characters).'; f.appendChild(p); } U.$('#cin', m.el).focus(); return; } fin({ ok: true, value: v }); m.close(); };
    new MutationObserver(() => { if (!document.body.contains(m.el)) fin({ ok: false }); }).observe(document.body, { childList: true });
  });
  UI.guardAction = async (fn) => { try { return await fn(); } catch (e) { UI.fail(e); } };

  /* ---------- meta / seo ---------- */
  UI.meta = (title, desc) => {
    const s = PLP.settings(), full = title ? `${title} | ${s.chapter_name}` : s.chapter_name, d = desc || 'PLP Chapter Gisenyi empowers youth in Rubavu District to become leaders of peace, unity and positive change.';
    document.title = full; const set = (sel, v) => { const el = U.$(sel); if (el) el.setAttribute('content', v); };
    set('meta[name=description]', d); set('meta[property="og:title"]', full); set('meta[property="og:description"]', d); set('meta[property="og:url"]', location.href);
    set('meta[property="og:image"]', new URL('public/plp-gisenyi-logo.svg', location.href).href);
  };

  /* ---------- brand ---------- */
  UI.logo = (dark, size = 40) => { const s = PLP.settings(), fb = dark ? 'public/plp-gisenyi-logo-white.svg' : 'public/plp-gisenyi-logo.svg'; return s.logo_ref ? `<img src="${fb}" data-media="${esc(s.logo_ref)}" alt="${esc(s.chapter_name)} logo" width="${size}" height="${size}">` : `<img src="${fb}" alt="${esc(s.chapter_name)} logo" width="${size}" height="${size}">`; };
  UI.applyTheme = () => { const s = PLP.settings(); document.documentElement.style.setProperty('--brand', s.brand_color); };
  const ICON = {
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8z" fill="currentColor"/>',
    instagram: '<rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="7" r="1.2" fill="currentColor"/>',
    twitter: '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    youtube: '<rect x="3" y="6" width="18" height="12" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
  };
  UI.socials = () => { const s = PLP.settings(); const l = ['facebook', 'instagram', 'twitter', 'youtube'].filter((k) => s[k]).map((k) => `<a class="social" href="${esc(s[k])}" target="_blank" rel="noopener noreferrer" aria-label="${U.cap(k === 'twitter' ? 'X (Twitter)' : k)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${ICON[k]}</svg></a>`).join(''); return l || '<span class="muted-on-dark">Social links are added by the chapter administrators.</span>'; };

  /* ---------- layouts ---------- */
  const PUB_NAV = [['/', 'Home'], ['/about', 'Our Story'], ['/events', 'Events'], ['/gallery', 'Gallery'], ['/news', 'News'], ['/join', 'Join Us'], ['/contact', 'Contact']];
  const isAct = (p, cur) => (p === '/' ? cur === '/' : cur === p || cur.startsWith(p + '/'));
  function publicShell(inner, cur, user) {
    const s = PLP.settings(), acct = user ? `<a class="btn btn-sm btn-ghost" href="#${user.role === 'MEMBER' ? '/dashboard' : '/admin'}">${user.role === 'MEMBER' ? 'My Dashboard' : 'Admin'}</a><button class="btn btn-sm btn-ghost" data-action="logout">Log out</button>` : `<a class="btn btn-sm btn-ghost" href="#/login">Log in</a>`;
    return `<a class="skip" href="#main">Skip to main content</a><header class="site-header"><div class="wrap bar"><a class="brand" href="#/" aria-label="${esc(s.chapter_name)} home">${UI.logo(false)}<span>${esc(s.chapter_name)}</span></a><button class="burger" data-action="toggle-nav" aria-expanded="false" aria-controls="mainnav" aria-label="Toggle menu"><span></span><span></span><span></span></button><nav id="mainnav" aria-label="Main navigation">${PUB_NAV.map(([p, l]) => `<a href="#${p}" ${isAct(p, cur) ? 'aria-current="page"' : ''} class="${p === '/join' ? 'btn btn-sm btn-primary' : ''}">${l}</a>`).join('')}<span class="nav-acct">${acct}</span></nav></div></header><main id="main" tabindex="-1">${inner}</main>${footer(s)}`;
  }
  function footer(s) {
    return `<footer class="site-footer"><div class="wrap grid4"><div><div class="brand dark">${UI.logo(true, 44)}<span>${esc(s.chapter_name)}</span></div><p>Empowering youth in Rubavu District to become leaders of peace, unity, and positive change beyond school.</p><div class="socials">${UI.socials()}</div></div><div><h2>Explore</h2><ul>${PUB_NAV.map(([p, l]) => `<li><a href="#${p}">${l}</a></li>`).join('')}</ul></div><div><h2>Chapter</h2><ul><li><a href="#/privacy">Privacy Policy</a></li><li><a href="#/terms">Terms</a></li>${s.parent_url ? `<li><a href="${esc(s.parent_url)}" target="_blank" rel="noopener noreferrer">Peace and Love Proclaimers (parent organization)</a></li>` : ''}<li><a href="#/login">Member &amp; admin login</a></li></ul></div><div><h2>Contact</h2><ul><li>${esc(s.address)}</li>${s.contact_email ? `<li><a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a></li>` : ''}${s.contact_phone ? `<li><a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a></li>` : ''}</ul></div></div><div class="wrap copy">&copy; ${new Date().getFullYear()} ${esc(s.chapter_name)}. All rights reserved.</div></footer>`;
  }
  const ADMIN_NAV = [
    ['/admin', 'Overview', null], ['/admin/applications', 'Applications', 'applications.view', 'apps'], ['/admin/members', 'Members', 'members.edit'], ['/admin/directory', 'Member Directory', 'members.view', null, 'members.edit'],
    ['/admin/events', 'Events', 'events.manage'], ['/admin/attendance', 'Attendance', 'events.manage'], ['/admin/news', 'News', 'news.manage'], ['/admin/gallery', 'Gallery', 'gallery.manage'],
    ['/admin/messages', 'Messages', 'messages.manage', 'msgs'], ['/admin/announcements', 'Announcements', 'announce.send'], ['/admin/reports', 'Reports', 'reports.view'],
    ['/admin/emails', 'Email Outbox', 'emails.view'], ['/admin/roles', 'Roles & Permissions', 'roles.manage'], ['/admin/audit-logs', 'Audit Logs', 'audit.view'], ['/admin/settings', 'System Settings', 'settings.manage'],
  ];
  function adminShell(inner, cur, user) {
    const s = PLP.settings(); let ov = {}; try { ov = API.overview(); } catch (e) { /* nav badges optional */ }
    const items = ADMIN_NAV.filter(([, , perm, , hideIf]) => (!perm || can(user.role, perm)) && !(hideIf && can(user.role, hideIf))).map(([p, l, , b]) => { const n = b === 'apps' ? ov.apps_PENDING : b === 'msgs' ? ov.messages_new : 0; return `<a href="#${p}" ${cur === p ? 'aria-current="page"' : ''}>${l}${n ? `<span class="badge-n" aria-label="${n} new">${n}</span>` : ''}</a>`; }).join('');
    return `<a class="skip" href="#main">Skip to main content</a><div class="dash admin"><aside class="side" id="side" aria-label="Admin navigation"><div class="side-head">${UI.logo(true, 40)}<span>${esc(s.chapter_name)}<small>Admin</small></span></div><nav>${items}</nav></aside><div class="dash-main"><header class="topbar"><button class="burger dark" data-action="toggle-side" aria-label="Toggle navigation" aria-expanded="false" aria-controls="side"><span></span><span></span><span></span></button><div class="grow"></div><div class="who"><strong>${esc(user.full_name)}</strong><span class="pill">${U.cap(user.role)}</span></div><a class="btn btn-sm btn-ghost" href="#/">View site</a><button class="btn btn-sm btn-ghost" data-action="logout">Log out</button></header><main id="main" tabindex="-1" class="dash-content">${inner}</main></div></div>`;
  }
  const MEM_NAV = [['/dashboard', 'Dashboard'], ['/dashboard/events', 'Events'], ['/dashboard/notifications', 'Notifications'], ['/dashboard/announcements', 'Announcements'], ['/dashboard/history', 'History'], ['/dashboard/card', 'Membership Card'], ['/profile', 'Profile'], ['/dashboard/settings', 'Settings']];
  function memberShell(inner, cur, user) {
    const s = PLP.settings(), un = API.unreadCount();
    return `<a class="skip" href="#main">Skip to main content</a><header class="site-header"><div class="wrap bar"><a class="brand" href="#/" aria-label="${esc(s.chapter_name)} home">${UI.logo(false)}<span>${esc(s.chapter_name)}</span></a><div class="grow"></div><span class="who hide-sm"><strong>${esc(user.full_name)}</strong></span><button class="btn btn-sm btn-ghost" data-action="logout">Log out</button></div></header><div class="wrap portal"><nav class="tabs" aria-label="Member navigation">${MEM_NAV.map(([p, l]) => `<a href="#${p}" ${cur === p ? 'aria-current="page"' : ''}>${l}${p.endsWith('notifications') && un ? `<span class="badge-n" aria-label="${un} unread">${un}</span>` : ''}</a>`).join('')}</nav><main id="main" tabindex="-1">${inner}</main></div>${footer(s)}`;
  }
  const bare = (inner) => `<a class="skip" href="#main">Skip to main content</a><main id="main" tabindex="-1" class="auth-wrap">${inner}</main>`;

  /* ---------- router ---------- */
  let navId = 0, pendingMeta = null;
  UI.setMeta = (t, d) => { pendingMeta = [t, d]; };
  async function dispatch(keepScroll) {
    const id = ++navId, raw = location.hash.replace(/^#/, '') || '/', [path, qs] = raw.split('?'), query = Object.fromEntries(new URLSearchParams(qs || ''));
    const prevUser = state.user, user = Auth.current(); state.user = user;
    if (prevUser && !user) UI.toast('Your session has ended. Please sign in again.', 'err');
    if (state.cleanup) { try { state.cleanup(); } catch (e) { /* noop */ } state.cleanup = null; }
    UI.applyTheme();
    let route = null, params = {};
    for (const r of routes) { const m = path.match(r.re); if (m) { route = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; } }
    if (!route) route = routes.find((r) => r.name === '404');
    const ctx = { path, params, query, user };
    const to = (p) => { if (location.hash !== '#' + p) UI.go(p); else dispatch(); };
    if (route.guard !== 'public') {
      if (!user) return to('/login?next=' + encodeURIComponent(raw));
      if (route.guard === 'member' && user.role !== 'MEMBER') return to('/admin');
      if (route.guard === 'admin' && user.role === 'MEMBER') return paint(id, 'bare', await Promise.resolve(forbidden()), ctx, { title: 'Access denied' });
      if (route.guard.includes('.') && !can(user.role, route.guard)) return paint(id, user.role === 'MEMBER' ? 'bare' : 'admin', forbidden(), ctx, { title: 'Access denied' });
    }
    if (user && ['/login', '/setup'].includes(path)) return to(user.role === 'MEMBER' ? '/dashboard' : '/admin');
    let html; try { html = await route.render(ctx); } catch (e) { if (id !== navId) return; if (e && e.code === 'UNAUTH') return to('/login?next=' + encodeURIComponent(raw)); if (e && e.code === 'FORBIDDEN') html = forbidden(); else { console.error(e); html = `<section class="wrap pad"><h1>Something went wrong</h1><p>We could not load this page. <a href="#/">Return home</a>.</p></section>`; } }
    if (typeof html === 'object' && html && html.redirect) return to(html.redirect);
    paint(id, route.layout, html, ctx, route, keepScroll);
  }
  function forbidden() { return `<section class="wrap pad center"><h1>403 - Access denied</h1><p>You do not have permission to view this page.</p><p><a class="btn btn-primary" href="#/">Go to home page</a></p></section>`; }
  function paint(id, layout, html, ctx, route, keepScroll) {
    if (id !== navId) return;
    const y = keepScroll ? w.scrollY : 0, u = ctx.user, cur = ctx.path;
    const out = layout === 'admin' ? adminShell(html, cur, u) : layout === 'member' ? memberShell(html, cur, u) : layout === 'bare' ? bare(html) : publicShell(html, cur, u);
    UI.root().innerHTML = out; const pm = pendingMeta; pendingMeta = null; UI.meta(pm ? pm[0] : route.title, pm ? pm[1] : route.desc); PLP.media.hydrate(UI.root());
    if (route.after) { try { state.cleanup = route.after(ctx) || null; } catch (e) { console.error(e); } }
    w.scrollTo(0, y); if (!keepScroll) { const m = U.$('#main'); if (m) m.focus({ preventScroll: true }); }
  }
  UI.paintInto = (sel, html) => { const el = U.$(sel); if (el) { el.innerHTML = html; PLP.media.hydrate(el); } };
  UI.notFound = () => `<section class="wrap pad center"><h1>404 - Page not found</h1><p>The page you are looking for does not exist.</p><p><a class="btn btn-primary" href="#/">Back to home</a></p></section>`;

  /* ---------- global events ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return; const h = handlers[el.dataset.action]; if (!h) return;
    if (el.tagName === 'BUTTON' || el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
    try { await h(el, e); } catch (err) { UI.fail(err); }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); const h = forms[f.dataset.form]; if (!h) return;
    const btn = U.$('button[type=submit]', f); if (btn) { if (btn.disabled) return; btn.disabled = true; }
    try { await h(f, U.formData(f), e); } catch (err) { if (err && err.fields) U.showErrors(f, err.fields); UI.fail(err); } finally { if (btn && document.contains(btn)) btn.disabled = false; }
  });
  document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, e); });
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && inputs[el.dataset.change]) inputs[el.dataset.change](el, e); });
  UI.on('toggle-nav', (el) => { const n = U.$('#mainnav'), o = n.classList.toggle('open'); el.setAttribute('aria-expanded', String(o)); });
  UI.on('toggle-side', (el) => { const n = U.$('#side'), o = n.classList.toggle('open'); el.setAttribute('aria-expanded', String(o)); });
  UI.on('logout', () => { Auth.logout(); state.user = null; UI.toast('You have been signed out.'); UI.go('/login'); });
  document.addEventListener('click', (e) => { const n = U.$('#mainnav.open'); if (n && e.target.closest('#mainnav a')) n.classList.remove('open'); const s = U.$('#side.open'); if (s && e.target.closest('#side a')) s.classList.remove('open'); });

  /* idle auto-logout for committee roles (30 min) */
  let last = Date.now(); ['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
  setInterval(() => { const u = state.user; if (u && PLP.RBAC.isAdminRole(u.role) && Date.now() - last > 30 * 6e4) { Auth.logout(); state.user = null; UI.toast('Signed out after 30 minutes of inactivity.', 'err'); UI.go('/login'); } }, 30000);

  UI.start = () => { w.addEventListener('hashchange', () => dispatch(false)); dispatch(false); };
  UI.table = (cols, rows, empty = 'Nothing to show yet.') => rows.length ? `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(cols[i])}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="empty">${esc(empty)}</p>`;
  UI.field = (name, label, o = {}) => { const id = 'f-' + name, v = o.value == null ? '' : o.value, req = o.required ? ' required' : '', t = o.type || 'text'; const ctl = t === 'textarea' ? `<textarea id="${id}" name="${name}" rows="${o.rows || 4}" maxlength="${o.max || 2000}"${req}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>${esc(v)}</textarea>` : t === 'select' ? `<select id="${id}" name="${name}"${req}>${(o.options || []).map((x) => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>` : `<input id="${id}" name="${name}" type="${t}" value="${esc(v)}"${req}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.max ? ` maxlength="${o.max}"` : ''}${o.autocomplete ? ` autocomplete="${o.autocomplete}"` : ''}${o.readonly ? ' readonly' : ''}${o.min != null ? ` min="${o.min}"` : ''}${o.maxv != null ? ` max="${o.maxv}"` : ''}>`; return `<div class="field ${o.cls || ''}"><label for="${id}">${esc(label)}${o.required ? ' <span aria-hidden="true">*</span>' : ''}</label>${ctl}${o.help ? `<small class="help">${esc(o.help)}</small>` : ''}</div>`; };
  UI.badge = (s) => `<span class="status s-${esc(String(s).toLowerCase())}">${esc(U.cap(s))}</span>`;
})(window);
