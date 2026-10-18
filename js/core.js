/* PLP Chapter Gisenyi - core utilities (no dependencies) */
(function (w) {
  'use strict';
  const PLP = (w.PLP = w.PLP || {});
  const U = (PLP.U = {});
  const V = (PLP.V = {});

  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.uuid = () => (w.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  U.token = () => Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('');
  U.now = () => new Date().toISOString();
  U.debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  U.norm = (s) => String(s || '').trim().toLowerCase();
  U.normPhone = (s) => String(s || '').replace(/[\s-]/g, '');
  U.cap = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  const dOpt = { day: 'numeric', month: 'short', year: 'numeric' };
  U.fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', dOpt) : '');
  U.fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  U.fmtDateTime = (iso) => (iso ? U.fmtDate(iso) + ', ' + U.fmtTime(iso) : '');
  U.toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  U.excerpt = (html, n = 140) => { const t = String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  U.slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------- validation (Zod-style rules) ---------- */
  V.run = (rules, data) => { const e = {}; for (const k in rules) for (const r of rules[k]) { const m = r(data[k], data); if (m) { e[k] = m; break; } } return e; };
  V.req = (label) => (v) => (v == null || String(v).trim() === '' ? `${label} is required` : '');
  V.email = (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? 'Enter a valid email address' : '');
  V.phone = (v) => (v && !/^\+?[0-9]{8,15}$/.test(U.normPhone(v)) ? 'Enter a valid phone number (8-15 digits)' : '');
  V.min = (n, l) => (v) => (v && String(v).trim().length < n ? `${l} must be at least ${n} characters` : '');
  V.max = (n, l) => (v) => (v && String(v).length > n ? `${l} must be at most ${n} characters` : '');
  V.year = (l) => (v) => { if (v === '' || v == null) return ''; const y = +v; return !Number.isInteger(y) || y < 1990 || y > new Date().getFullYear() + 8 ? `${l} must be a valid year` : ''; };
  V.pastDate = (l) => (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) || d > new Date() || d.getFullYear() < 1930 ? `${l} must be a valid past date` : ''; };
  V.futureOk = (l) => (v) => (v && isNaN(new Date(v)) ? `${l} is not a valid date` : '');
  V.password = (v) => (!v || v.length < 8 ? 'Password must be at least 8 characters' : !/[A-Za-z]/.test(v) || !/[0-9]/.test(v) ? 'Password must contain letters and numbers' : '');
  V.oneOf = (list, l) => (v) => (v && !list.includes(v) ? `${l} is not valid` : '');

  U.formData = (form) => { const o = {}; new FormData(form).forEach((v, k) => { if (!(v instanceof File)) o[k] = typeof v === 'string' ? v.trim() : v; }); U.$$('input[type=checkbox]', form).forEach((c) => { if (c.name) o[c.name] = c.checked; }); return o; };
  U.showErrors = (form, errors) => {
    U.$$('.field-error', form).forEach((n) => n.remove());
    U.$$('[aria-invalid]', form).forEach((n) => n.removeAttribute('aria-invalid'));
    let first = null;
    Object.keys(errors).forEach((k) => {
      const el = form.elements[k]; if (!el) return;
      const target = el.length && !el.tagName ? el[0] : el;
      const id = `err-${k}-${Math.random().toString(36).slice(2, 6)}`;
      const m = document.createElement('p'); m.className = 'field-error'; m.id = id; m.setAttribute('role', 'alert'); m.textContent = errors[k];
      (target.closest('.field') || target.parentNode).appendChild(m);
      target.setAttribute('aria-invalid', 'true'); target.setAttribute('aria-describedby', id);
      if (!first) first = target;
    });
    if (first) first.focus();
  };

  /* ---------- HTML sanitiser for rich text (allow-list) ---------- */
  const ALLOW = { B: [], STRONG: [], I: [], EM: [], U: [], P: [], BR: [], H2: [], H3: [], UL: [], OL: [], LI: [], BLOCKQUOTE: [], A: ['href'], IMG: ['data-media', 'alt', 'src'], DIV: [], SPAN: [] };
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'MATH', 'TEXTAREA', 'SELECT']);
  U.sanitizeHtml = (html) => {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    const walk = (node) => {
      Array.from(node.childNodes).forEach((ch) => {
        if (ch.nodeType === 3) return;
        if (ch.nodeType !== 1) { ch.remove(); return; }
        if (DROP.has(ch.tagName)) { ch.remove(); return; }
        walk(ch);
        const allowed = ALLOW[ch.tagName];
        if (!allowed) { while (ch.firstChild) node.insertBefore(ch.firstChild, ch); ch.remove(); return; }
        Array.from(ch.attributes).forEach((a) => { if (!allowed.includes(a.name)) ch.removeAttribute(a.name); });
        if (ch.tagName === 'A') { const h = ch.getAttribute('href') || ''; if (!/^(https?:|mailto:)/i.test(h)) ch.removeAttribute('href'); else { ch.setAttribute('rel', 'noopener noreferrer'); ch.setAttribute('target', '_blank'); } }
        if (ch.tagName === 'IMG') { const s = ch.getAttribute('src'); if (s && !/^https:/i.test(s)) ch.removeAttribute('src'); const m = ch.getAttribute('data-media'); if (m && !/^idb:[0-9a-f-]{36}$/.test(m)) ch.removeAttribute('data-media'); if (!ch.getAttribute('src') && !ch.getAttribute('data-media')) { ch.remove(); return; } ch.setAttribute('loading', 'lazy'); if (!ch.hasAttribute('alt')) ch.setAttribute('alt', ''); }
      });
    };
    walk(doc.body); return doc.body.innerHTML;
  };

  /* ---------- CSV / download / PDF ---------- */
  U.csv = (headers, rows) => {
    const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '\ufeff' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  };
  U.download = (name, mime, data) => { const blob = data instanceof Blob ? data : new Blob([data], { type: mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  U.makePdf = (title, headers, rows) => {
    const clean = (s) => String(s == null ? '' : s).replace(/[^\x20-\x7e]/g, '?').replace(/\\/g, '/').replace(/[()]/g, ' ');
    const MAXC = 100; let widths = headers.map((h, i) => Math.min(28, Math.max(clean(h).length, ...rows.map((r) => clean(r[i]).length), 3)));
    while (widths.reduce((a, b) => a + b, 0) + 2 * (widths.length - 1) > MAXC) { const m = Math.max(...widths); widths[widths.indexOf(m)]--; }
    const fmt = (r) => r.map((c, i) => clean(c).slice(0, widths[i]).padEnd(widths[i])).join('  ').trimEnd();
    const lines = [clean(title), 'PLP Chapter Gisenyi - generated ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', '', fmt(headers), '-'.repeat(Math.min(MAXC, widths.reduce((a, b) => a + b, 0) + 2 * (widths.length - 1))), ...rows.map(fmt)];
    if (!rows.length) lines.push('(no records)');
    const per = 64, pages = []; for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
    const kids = [];
    pages.forEach((pl) => {
      let t = 'BT /F1 8.5 Tf 11 TL 40 800 Td\n'; pl.forEach((l) => { t += '(' + l + ') Tj T*\n'; }); t += 'ET';
      const c = add(`<< /Length ${t.length} >>\nstream\n${t}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${c} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`));
    });
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xr = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  };

  /* ---------- pagination ---------- */
  U.paginate = (arr, page, size) => { const pages = Math.max(1, Math.ceil(arr.length / size)); const p = Math.min(Math.max(1, page | 0 || 1), pages); return { items: arr.slice((p - 1) * size, p * size), page: p, pages, total: arr.length }; };
  U.pager = (pg, action = 'page') => pg.pages <= 1 ? '' : `<nav class="pager" aria-label="Pagination"><button class="btn btn-sm btn-ghost" data-action="${action}" data-page="${pg.page - 1}" ${pg.page <= 1 ? 'disabled' : ''}>Previous</button><span aria-live="polite">Page ${pg.page} of ${pg.pages} <small>(${pg.total} total)</small></span><button class="btn btn-sm btn-ghost" data-action="${action}" data-page="${pg.page + 1}" ${pg.page >= pg.pages ? 'disabled' : ''}>Next</button></nav>`;

  /* ---------- SVG charts (inline, accessible) ---------- */
  const PAL = ['#0f7a3d', '#d97706', '#2563eb', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#be185d'];
  U.noData = '<p class="muted">No data for this period yet.</p>';
  U.barChart = (items, title) => {
    if (!items.length) return U.noData;
    const W = 560, H = 240, pl = 36, pb = 52, pt = 12, max = Math.max(...items.map((i) => i.value), 1), bw = (W - pl) / items.length;
    const bars = items.map((it, i) => { const h = ((H - pb - pt) * it.value) / max, x = pl + i * bw + bw * 0.15, y = H - pb - h; return `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${h}" fill="${PAL[0]}" rx="3"><title>${U.esc(it.label)}: ${it.value}</title></rect><text x="${x + bw * 0.35}" y="${y - 4}" text-anchor="middle" font-size="11" fill="currentColor">${it.value}</text><text x="${x + bw * 0.35}" y="${H - pb + 14}" text-anchor="end" font-size="10" fill="currentColor" transform="rotate(-30 ${x + bw * 0.35} ${H - pb + 14})">${U.esc(String(it.label).slice(0, 14))}</text>`; }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(title)}"><line x1="${pl}" y1="${H - pb}" x2="${W}" y2="${H - pb}" stroke="currentColor" opacity=".3"/>${bars}</svg>`;
  };
  U.pieChart = (items, title) => {
    const tot = items.reduce((a, b) => a + b.value, 0); if (!tot) return U.noData;
    let a0 = -Math.PI / 2; const R = 80, C = 90;
    const segs = items.filter((i) => i.value > 0).map((it, i) => { const a1 = a0 + (it.value / tot) * 2 * Math.PI; const big = a1 - a0 > Math.PI ? 1 : 0; const full = it.value === tot; const d = full ? `M ${C - R} ${C} A ${R} ${R} 0 1 1 ${C + R} ${C} A ${R} ${R} 0 1 1 ${C - R} ${C} Z` : `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${big} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`; a0 = a1; return `<path d="${d}" fill="${PAL[i % PAL.length]}"><title>${U.esc(it.label)}: ${it.value}</title></path>`; }).join('');
    const legend = items.map((it, i) => `<li><span class="sw" style="background:${PAL[i % PAL.length]}"></span>${U.esc(it.label)} <b>${it.value}</b> <small>(${Math.round((it.value / tot) * 100)}%)</small></li>`).join('');
    return `<div class="pie"><svg class="chart-sm" viewBox="0 0 180 180" role="img" aria-label="${U.esc(title)}">${segs}</svg><ul class="legend">${legend}</ul></div>`;
  };
  U.lineChart = (pts, title) => {
    if (!pts.length) return U.noData;
    const W = 560, H = 220, pl = 36, pb = 40, pt = 14, max = Math.max(...pts.map((p) => p.value), 1), st = pts.length > 1 ? (W - pl - 16) / (pts.length - 1) : 0;
    const xy = pts.map((p, i) => [pl + i * st + (pts.length === 1 ? 20 : 0), H - pb - ((H - pb - pt) * p.value) / max]);
    const path = xy.map((c, i) => (i ? 'L' : 'M') + c[0] + ' ' + c[1]).join(' ');
    const dots = xy.map((c, i) => `<circle cx="${c[0]}" cy="${c[1]}" r="4" fill="${PAL[0]}"><title>${U.esc(pts[i].label)}: ${pts[i].value}</title></circle><text x="${c[0]}" y="${H - pb + 16}" text-anchor="middle" font-size="10" fill="currentColor">${U.esc(pts[i].label)}</text><text x="${c[0]}" y="${c[1] - 8}" text-anchor="middle" font-size="11" fill="currentColor">${pts[i].value}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(title)}"><line x1="${pl}" y1="${H - pb}" x2="${W}" y2="${H - pb}" stroke="currentColor" opacity=".3"/><path d="${path}" fill="none" stroke="${PAL[0]}" stroke-width="2.5"/>${dots}</svg>`;
  };
})(window);
