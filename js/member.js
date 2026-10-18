/* PLP Chapter Gisenyi - member portal */
(function (w) {
  'use strict';
  const PLP = w.PLP, U = PLP.U, UI = PLP.UI, API = PLP.API, Auth = PLP.Auth, esc = U.esc;
  const R = (p, o) => UI.route(p, Object.assign({ guard: 'member', layout: 'member' }, o));
  const empty = (t) => `<p class="empty">${esc(t)}</p>`;
  const prio = (a) => `<span class="status ${a.priority === 'HIGH' ? 's-rejected' : 's-upcoming'}">${a.priority === 'HIGH' ? 'High priority' : 'Normal'}</span>`;
  const evRow = (e) => `<li class="listrow"><div><b><a href="#/events/${e.id}">${esc(e.title)}</a></b><br><span class="small muted">📅 ${U.fmtDateTime(e.event_date)}${e.location ? ' · 📍 ' + esc(e.location) : ''}</span></div>${e.registered_by_me || e.reg ? `<span class="status s-active">Registered</span>` : `<a class="btn btn-sm btn-primary" href="#/events/${e.id}">Register</a>`}</li>`;

  R('/dashboard', { title: 'Dashboard', render: () => {
    const d = API.dashboard(), m = d.member, mm = API.myMember(), s = d.stats;
    return `<section class="welcome"><div><h1>Welcome, ${esc(m.full_name)}</h1><p>Membership ID: <b class="mono">${esc(m.membership_id)}</b> <span class="pill">Member</span></p></div><a class="btn btn-light" href="#/dashboard/card">View membership card</a></section>
    <ul class="statcards"><li><b>${s.joined}</b><span>Events joined</span></li><li><b>${s.volunteer}</b><span>Volunteer participation</span></li><li><b>${UI.badge(s.status)}</b><span>Membership status</span></li><li><b>${s.pending}</b><span>Pending event registrations</span></li></ul>
    <div class="grid2"><section class="card"><h2>Upcoming events</h2>${d.upcoming.length ? `<ul class="list">${d.upcoming.map(evRow).join('')}</ul>` : empty('No upcoming events right now.')}<a href="#/dashboard/events">See all events →</a></section>
    <section class="card"><h2>Announcements</h2>${d.announcements.length ? `<ul class="list">${d.announcements.map((a) => `<li class="listrow"><div><b>${esc(a.title)}</b><br><span class="small muted">${esc(U.excerpt(a.body, 90))}</span></div>${prio(a)}</li>`).join('')}</ul>` : empty('No announcements yet.')}<a href="#/dashboard/announcements">All announcements →</a></section></div>
    <div class="grid2"><section class="card"><h2>Activity summary</h2>${d.activity.length ? `<ul class="list">${d.activity.map((a) => `<li class="listrow"><span>${esc(a.text)}</span><span class="small muted">${U.fmtDate(a.created_at)}</span></li>`).join('')}</ul>` : empty('Your recent activity will appear here.')}</section>
    <section class="card"><h2>Membership status</h2><dl class="dl"><dt>Status</dt><dd>${UI.badge(m.status)}</dd><dt>Join date</dt><dd>${U.fmtDate(m.join_date)}</dd><dt>Membership ID</dt><dd class="mono">${esc(m.membership_id)}</dd><dt>Approval date</dt><dd>${mm.approved_at ? U.fmtDate(mm.approved_at) : 'n/a'}</dd><dt>Approved by</dt><dd>${mm.approver && mm.approver !== 'System' ? esc(mm.approver) : 'Chapter committee'}</dd></dl></section></div>`;
  } });

  /* profile */
  R('/profile', { title: 'My profile', render: () => {
    const m = API.myMember(), u = UI.user(), f = UI.field;
    return `<h1>My profile</h1><div class="grid2"><section class="card center"><div class="avatar big" ${m.profile_image ? `data-media="${esc(m.profile_image)}"` : ''} role="img" aria-label="Profile photo">${m.profile_image ? '' : esc(m.full_name[0])}</div><label class="btn btn-sm btn-ghost" for="photo">Change photo</label><input id="photo" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" data-change="photo"><p class="small muted">JPG, PNG or WEBP, max 10MB.</p></section><section class="card"><h2>Account</h2><dl class="dl"><dt>Membership ID</dt><dd class="mono">${esc(m.membership_id)}</dd><dt>Role</dt><dd>Member</dd><dt>Status</dt><dd>${UI.badge(m.status)}</dd></dl><p class="small muted">Name, email, role and membership ID can only be changed by the committee.</p></section></div>
    <form data-form="profile" novalidate class="form card"><h2>Personal details</h2><div class="grid2">${f('full_name', 'Full name', { value: m.full_name, readonly: true })}${f('email', 'Email', { value: u.email, readonly: true })}${f('phone', 'Phone number', { type: 'tel', value: m.phone, required: true })}${f('school', 'School', { value: m.school })}${f('graduation_year', 'Graduation year', { type: 'number', value: m.graduation_year, min: 1990, maxv: new Date().getFullYear() + 8 })}${f('occupation', 'Occupation', { value: m.occupation })}${f('district', 'District', { value: m.district })}${f('sector', 'Sector', { value: m.sector })}${f('cell', 'Cell', { value: m.cell })}${f('village', 'Village', { value: m.village })}</div>${f('skills', 'Skills', { type: 'textarea', rows: 3, max: 500, value: m.skills })}<button class="btn btn-primary" type="submit">Save changes</button></form>`;
  } });
  UI.form('profile', (form, d) => { API.updateProfile(d); UI.toast('Profile updated.'); });
  UI.input('photo', async (el) => { const file = el.files[0]; if (!file) return; await UI.guardAction(async () => { const m = API.myMember(), r = await PLP.media.put(file, ['image']); API.updateProfile(Object.assign({}, m, { profile_image: r.ref })); if (m.profile_image) PLP.media.del(m.profile_image); UI.toast('Photo updated.'); UI.refresh(); }); });

  /* events */
  R('/dashboard/events', { title: 'Events', render: () => {
    const ev = API.myEvents().filter((e) => ['UPCOMING', 'ONGOING'].includes(e.eff_status));
    return `<h1>Events</h1>${ev.length ? `<div class="grid3">${ev.map((e) => `<article class="card ev"><div class="row between"><span class="tag">${esc(e.category)}</span>${UI.badge(e.eff_status)}</div><h3><a href="#/events/${e.id}">${esc(e.title)}</a></h3><ul class="meta"><li>📅 ${U.fmtDateTime(e.event_date)}</li>${e.location ? `<li>📍 ${esc(e.location)}</li>` : ''}</ul><p>${esc(U.excerpt(e.description, 100))}</p><div class="row gap"><a class="btn btn-sm btn-ghost" href="#/events/${e.id}">Details</a>${e.reg ? `<button class="btn btn-sm btn-ghost" data-action="cancel-reg" data-id="${e.id}">Cancel</button><span class="status s-active">Registered</span>` : `<button class="btn btn-sm btn-primary" data-action="do-reg" data-id="${e.id}">Register</button>`}</div></article>`).join('')}</div>` : empty('No upcoming events. Check back soon.')}`;
  } });

  /* notifications */
  R('/dashboard/notifications', { title: 'Notifications', render: () => {
    const n = API.myNotifications();
    return `<div class="row between"><h1>Notifications</h1>${n.some((x) => !x.read) ? '<button class="btn btn-sm btn-ghost" data-action="read-all">Mark all as read</button>' : ''}</div>${n.length ? `<ul class="list card">${n.map((x) => `<li class="listrow ${x.read ? '' : 'unread'}"><div><b>${esc(x.title)}</b> ${x.read ? '' : '<span class="status s-pending">New</span>'}<br><span class="small">${esc(x.body)}</span><br><span class="small muted">${U.cap(x.type)} · ${U.fmtDateTime(x.created_at)}</span></div>${x.read ? '' : `<button class="btn btn-sm btn-ghost" data-action="read-one" data-id="${x.id}">Mark read</button>`}</li>`).join('')}</ul>` : empty('You have no notifications.')}`;
  } });
  UI.on('read-all', () => { API.markNotification(); UI.refresh(); }); UI.on('read-one', (el) => { API.markNotification(el.dataset.id); UI.refresh(); });

  /* announcements */
  let AF = 'ALL';
  const paintAnn = () => { const a = API.myAnnouncements().filter((x) => AF === 'ALL' || x.priority === AF); UI.paintInto('#alist', a.length ? `<ul class="list card">${a.map((x) => `<li class="listrow ${x.read ? '' : 'unread'}"><div><b>${esc(x.title)}</b> ${prio(x)}<p>${esc(x.body).replace(/\n/g, '<br>')}</p><span class="small muted">${esc(x.author)} · ${U.fmtDateTime(x.created_at)}</span></div>${x.read ? '<span class="small muted">Read</span>' : `<button class="btn btn-sm btn-ghost" data-action="ann-read" data-id="${x.id}">Mark as read</button>`}</li>`).join('')}</ul>` : empty('No announcements match.')); };
  UI.input('ann-f', (el) => { AF = el.value; paintAnn(); }); UI.on('ann-read', (el) => { API.markAnnouncementRead(el.dataset.id); paintAnn(); });
  R('/dashboard/announcements', { title: 'Announcements', after: paintAnn, render: () => { AF = 'ALL'; return `<h1>Announcements</h1><div class="filters"><div class="field inline"><label for="af">Importance</label><select id="af" data-change="ann-f"><option value="ALL">All</option><option value="HIGH">High priority</option><option value="NORMAL">Normal</option></select></div></div><div id="alist"></div>`; } });

  /* history */
  R('/dashboard/history', { title: 'Participation history', render: () => { const h = API.history(); return `<h1>Participation history</h1>${UI.table(['Event', 'Date', 'Category', 'Status'], h.map((r) => [esc(r.event), U.fmtDate(r.date), esc(r.category), UI.badge(r.status)]), 'You have not registered for any events yet.')}`; } });

  /* membership card */
  R('/dashboard/card', { title: 'Membership card', render: () => {
    const m = API.myMember(), s = PLP.settings();
    return `<h1>Membership card</h1><div class="idcard" id="idcard"><div class="idcard-head">${UI.logo(true, 44)}<div><b>${esc(s.chapter_name)}</b><small>Peace · Love · Unity</small></div></div><div class="idcard-body"><div class="avatar" ${m.profile_image ? `data-media="${esc(m.profile_image)}"` : ''} role="img" aria-label="Profile photo of ${esc(m.full_name)}">${m.profile_image ? '' : esc(m.full_name[0])}</div><div class="idcard-info"><h2>${esc(m.full_name)}</h2><p class="mono">${esc(m.membership_id)}</p><p>Role: <b>Member</b></p><p>Chapter: <b>PLP Gisenyi</b></p></div><div class="idcard-qr">${PLP.qrSvg(m.membership_id, 112, 'QR code for membership ID ' + m.membership_id)}</div></div></div><p><button class="btn btn-primary" onclick="window.print()">Print / save as PDF</button></p><p class="small muted">The QR code contains your membership ID and will be used for event check-in and identity verification.</p>`;
  } });

  /* settings */
  R('/dashboard/settings', { title: 'Settings', render: () => {
    const p = (UI.user().prefs || {}), f = UI.field;
    return `<h1>Settings</h1><div class="grid2"><form data-form="pw" novalidate class="form card"><h2>Change password</h2>${f('current', 'Current password', { type: 'password', required: true, autocomplete: 'current-password' })}${f('next', 'New password', { type: 'password', required: true, autocomplete: 'new-password', help: 'At least 8 characters with letters and numbers.' })}${f('confirm', 'Confirm new password', { type: 'password', required: true, autocomplete: 'new-password' })}<button class="btn btn-primary" type="submit">Update password</button></form><div><form data-form="prefs" class="form card"><h2>Notification preferences</h2><div class="field check"><label><input type="checkbox" name="email_events" ${p.email_events !== false ? 'checked' : ''}> Email me about events</label></div><div class="field check"><label><input type="checkbox" name="email_announcements" ${p.email_announcements !== false ? 'checked' : ''}> Email me about announcements</label></div><button class="btn btn-ghost" type="submit">Save preferences</button></form><section class="card"><h2>Contact details</h2><p>Update your phone number and address on the <a href="#/profile">profile page</a>.</p><button class="btn btn-ghost" data-action="logout">Log out</button></section></div></div>`;
  } });
  UI.form('pw', async (form, d) => { await Auth.changePassword(d.current, d.next, d.confirm); form.reset(); UI.toast('Password updated.'); });
  UI.form('prefs', (form, d) => { API.setPrefs({ email_events: !!d.email_events, email_announcements: !!d.email_announcements }); UI.toast('Preferences saved.'); });
})(window);
