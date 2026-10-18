/* Minimal QR Code generator: byte mode, error-correction level L, versions 1-5 (up to 106 bytes). */
(function (w) {
  'use strict';
  const PLP = (w.PLP = w.PLP || {});
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const VER = { 1: { total: 26, data: 19, ec: 7, align: [] }, 2: { total: 44, data: 34, ec: 10, align: [6, 18] }, 3: { total: 70, data: 55, ec: 15, align: [6, 22] }, 4: { total: 100, data: 80, ec: 20, align: [6, 26] }, 5: { total: 134, data: 108, ec: 26, align: [6, 30] } };
  function rsDivisor(deg) { let r = [1]; for (let i = 0; i < deg; i++) { const n = new Array(r.length + 1).fill(0); for (let j = 0; j < r.length; j++) { n[j] ^= r[j]; n[j + 1] ^= mul(r[j], EXP[i]); } r = n; } return r; }
  function rsRemainder(data, gen) { const res = new Array(gen.length - 1).fill(0); data.forEach((b) => { const f = b ^ res.shift(); res.push(0); for (let i = 0; i < res.length; i++) res[i] ^= mul(gen[i + 1], f); }); return res; }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let v = 0; for (let k = 1; k <= 5; k++) if (bytes.length <= VER[k].data - 2) { v = k; break; }
    if (!v) throw new Error('QR data too long');
    const info = VER[v], bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, 8); bytes.forEach((b) => push(b, 8));
    push(0, Math.min(4, info.data * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; cw.length < info.data; p ^= 1) cw.push(p ? 0x11 : 0xec);
    const all = cw.concat(rsRemainder(cw, rsDivisor(info.ec)));
    const size = 17 + 4 * v, M = [], F = [];
    for (let i = 0; i < size; i++) { M.push(new Array(size).fill(false)); F.push(new Array(size).fill(false)); }
    const setF = (x, y, d) => { if (x >= 0 && y >= 0 && x < size && y < size) { M[y][x] = d; F[y][x] = true; } };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); setF(cx + dx, cy + dy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = info.align; al.forEach((ay, i) => al.forEach((ax, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const drawFormat = (mask) => {
      const data = (1 << 3) | mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((data << 10) | rem) ^ 0x5412, g = (i) => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) setF(8, i, g(i)); setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8)); for (let i = 9; i < 15; i++) setF(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) setF(8, size - 15 + i, g(i)); setF(8, size - 8, true);
    };
    drawFormat(0);
    let k = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!F[y][x] && k < all.length * 8) { M[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; } } }
    const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && maskFn[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => {
      let p = 0;
      for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { const c = pass ? M[b][a] : M[a][b], pr = pass ? M[b - 1][a] : M[a][b - 1]; if (c === pr) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (M[y][x] === M[y][x + 1] && M[y][x] === M[y + 1][x] && M[y][x] === M[y + 1][x + 1]) p += 3;
      let dark = 0; M.forEach((r) => r.forEach((c) => { if (c) dark++; })); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10; return p;
    };
    let best = 0, bp = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const s = penalty(); if (s < bp) { bp = s; best = m; } applyMask(m); }
    applyMask(best); drawFormat(best);
    return M;
  }
  PLP.qrSvg = (text, px = 160, label = 'QR code') => {
    const M = encode(text), n = M.length + 8; let d = '';
    M.forEach((r, y) => r.forEach((c, x) => { if (c) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  };
})(window);
