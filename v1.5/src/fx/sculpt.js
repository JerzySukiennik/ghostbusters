// SDF sculpting toolkit (no three.js): primitives, narrow-band surface nets, per-vertex rig attributes, compact binary mesh format.
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / rx, y2 = y / ry, z2 = z / rz;
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}

export function sdSph(px, py, pz, cx, cy, cz, r) { const x = px - cx, y = py - cy, z = pz - cz; return Math.sqrt(x * x + y * y + z * z) - r; }

export function sdCap(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const x = pax - bax * h, y = pay - bay * h, z = paz - baz * h;
  return Math.sqrt(x * x + y * y + z * z) - r;
}

export function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

export function sdBox(px, py, pz, cx, cy, cz, hx, hy, hz, r = 0) {
  const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r, qz = Math.abs(pz - cz) - hz + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}

export function sdRBoxT(px, py, pz, cx, cy, cz, hx, hy, hz, r, tilt) {
  let x = px - cx, y = py - cy; const z = pz - cz;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const xr = c * x - s * y, yr = s * x + c * y; x = xr; y = yr;
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}

export function sdCylX(px, py, pz, cx, cy, cz, r, h, rr = 0) {
  const dx = Math.abs(px - cx) - h + rr, dr = Math.hypot(py - cy, pz - cz) - r + rr;
  return Math.min(Math.max(dx, dr), 0) + Math.hypot(Math.max(dx, 0), Math.max(dr, 0)) - rr;
}

export function sdTorusX(px, py, pz, cx, cy, cz, R, r) { const q = Math.hypot(py - cy, pz - cz) - R; return Math.hypot(px - cx, q) - r; }

export function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }

export function chain(px, py, pz, pts, k) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    d = smin(d, sdRoundCone(px, py, pz, a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]), i === 0 ? k * 1.5 : k);
  }
  return d;
}

export function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vn3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi), c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1), c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const a = c000 + (c100 - c000) * fx, b = c010 + (c110 - c010) * fx, c = c001 + (c101 - c001) * fx, d = c011 + (c111 - c011) * fx;
  const e = a + (b - a) * fy, f = c + (d - c) * fy;
  return (e + (f - e) * fz) * 2 - 1;
}

export function fbm(x, y, z) { return vn3(x, y, z) * 0.5 + vn3(x * 2.03 + 7.1, y * 2.03 + 7.1, z * 2.03 + 7.1) * 0.25 + vn3(x * 4.01 + 3.3, y * 4.01 + 3.3, z * 4.01 + 3.3) * 0.125; }

const OX = [0, 1, 0, 1, 0, 1, 0, 1], OY = [0, 0, 1, 1, 0, 0, 1, 1], OZ = [0, 0, 0, 0, 1, 1, 1, 1];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

export function surfaceNets(sdf, bounds, cell, keep) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const h = cell;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  const S = 4;
  const cx0 = Math.ceil((nx - 1) / S) + 2, cy0 = Math.ceil((ny - 1) / S) + 2, cz0 = Math.ceil((nz - 1) / S) + 2;
  const C = new Float32Array(cx0 * cy0 * cz0);
  const cid = (i, j, k) => i + cx0 * (j + cy0 * k);
  for (let k = 0; k < cz0; k++) for (let j = 0; j < cy0; j++) for (let i = 0; i < cx0; i++) C[cid(i, j, k)] = sdf(x0 + i * S * h, y0 + j * S * h, z0 + k * S * h);
  const band = S * h * 1.9;
  for (let k = 0; k < nz; k++) {
    const ck = Math.min(Math.floor(k / S), cz0 - 2), fk = k / S - ck;
    for (let j = 0; j < ny; j++) {
      const cj = Math.min(Math.floor(j / S), cy0 - 2), fj = j / S - cj;
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(Math.floor(i / S), cx0 - 2), fi = i / S - ci;
        const c000 = C[cid(ci, cj, ck)], c100 = C[cid(ci + 1, cj, ck)], c010 = C[cid(ci, cj + 1, ck)], c110 = C[cid(ci + 1, cj + 1, ck)];
        const c001 = C[cid(ci, cj, ck + 1)], c101 = C[cid(ci + 1, cj, ck + 1)], c011 = C[cid(ci, cj + 1, ck + 1)], c111 = C[cid(ci + 1, cj + 1, ck + 1)];
        const mn = Math.min(Math.abs(c000), Math.abs(c100), Math.abs(c010), Math.abs(c110), Math.abs(c001), Math.abs(c101), Math.abs(c011), Math.abs(c111));
        const sg = Math.sign(c000);
        if (mn > band && sg === Math.sign(c111) && sg === Math.sign(c100) && sg === Math.sign(c010) && sg === Math.sign(c001) && sg === Math.sign(c110) && sg === Math.sign(c101) && sg === Math.sign(c011)) {
          const a = c000 + (c100 - c000) * fi, b = c010 + (c110 - c010) * fi, c = c001 + (c101 - c001) * fi, d = c011 + (c111 - c011) * fi;
          const e = a + (b - a) * fj, f = c + (d - c) * fj;
          F[id(i, j, k)] = e + (f - e) * fk;
        } else F[id(i, j, k)] = sdf(x0 + i * h, y0 + j * h, z0 + k * h);
      }
    }
  }
  const vIndex = new Int32Array(nx * ny * nz).fill(-1);
  const P = [];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[id(i + OX[c], j + OY[c], k + OZ[c])]; if (val[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += OX[a] + (OX[b] - OX[a]) * t; sy += OY[a] + (OY[b] - OY[a]) * t; sz += OZ[a] + (OZ[b] - OZ[a]) * t; n++;
    }
    vIndex[id(i, j, k)] = P.length / 3;
    P.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F[id(i, j, k)] < 0;
    if (v0 !== (F[id(i + 1, j, k)] < 0)) quad(vIndex[id(i, j - 1, k - 1)], vIndex[id(i, j, k - 1)], vIndex[id(i, j, k)], vIndex[id(i, j - 1, k)], v0);
    if (v0 !== (F[id(i, j + 1, k)] < 0)) quad(vIndex[id(i - 1, j, k - 1)], vIndex[id(i - 1, j, k)], vIndex[id(i, j, k)], vIndex[id(i, j, k - 1)], v0);
    if (v0 !== (F[id(i, j, k + 1)] < 0)) quad(vIndex[id(i - 1, j - 1, k)], vIndex[id(i, j - 1, k)], vIndex[id(i, j, k)], vIndex[id(i - 1, j, k)], v0);
  }
  let pos = new Float32Array(P), tri = idx;
  if (keep) {
    const nv0 = pos.length / 3, remap = new Int32Array(nv0).fill(-1), np = [];
    const out = [];
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t], b = tri[t + 1], c = tri[t + 2];
      const mx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, my = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, mz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
      if (!keep(mx, my, mz)) continue;
      for (const v of [a, b, c]) { if (remap[v] < 0) { remap[v] = np.length / 3; np.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } out.push(remap[v]); }
    }
    pos = new Float32Array(np); tri = out;
  }
  return { position: pos, index: tri };
}

export function project(sdf, pos, normal, iters = 2, e = 0.0022) {
  const nv = pos.length / 3;
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < iters; it++) {
      const d = sdf(x, y, z);
      gx = sdf(x + e, y, z) - sdf(x - e, y, z); gy = sdf(x, y + e, z) - sdf(x, y - e, z); gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (Math.abs(d) < 0.05) { x -= gx * d; y -= gy * d; z -= gz * d; }
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    normal[v * 3] = gx; normal[v * 3 + 1] = gy; normal[v * 3 + 2] = gz;
  }
}

export function sculpt({ sdf, bounds, cell, layout, attr, keep }) {
  const { position, index } = surfaceNets(sdf, bounds, cell, keep);
  const nv = position.length / 3;
  const normal = new Float32Array(nv * 3);
  project(sdf, position, normal);
  const width = layout.reduce((s, a) => s + a.size, 0);
  const tmp = new Float32Array(width);
  const data = layout.map((a) => new Float32Array(nv * a.size));
  for (let v = 0; v < nv; v++) {
    tmp.fill(0);
    attr(position[v * 3], position[v * 3 + 1], position[v * 3 + 2], normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2], tmp);
    let o = 0;
    for (let a = 0; a < layout.length; a++) { const sz = layout[a].size; for (let c = 0; c < sz; c++) data[a][v * sz + c] = tmp[o + c]; o += sz; }
  }
  const attrs = {};
  layout.forEach((a, i) => { attrs[a.name] = data[i]; });
  return { position, normal, attrs, index };
}

export function merge(parts) {
  const nv = parts.reduce((s, p) => s + p.position.length / 3, 0);
  const ni = parts.reduce((s, p) => s + p.index.length, 0);
  const position = new Float32Array(nv * 3), normal = new Float32Array(nv * 3), attrs = {}, index = new Uint32Array(ni);
  for (const k of Object.keys(parts[0].attrs)) attrs[k] = new Float32Array(nv * (parts[0].attrs[k].length / (parts[0].position.length / 3)));
  let vo = 0, io = 0;
  for (const p of parts) {
    const n = p.position.length / 3;
    position.set(p.position, vo * 3); normal.set(p.normal, vo * 3);
    for (const k of Object.keys(attrs)) { const sz = p.attrs[k].length / n; attrs[k].set(p.attrs[k], vo * sz); }
    for (let i = 0; i < p.index.length; i++) index[io + i] = p.index[i] + vo;
    vo += n; io += p.index.length;
  }
  return { position, normal, attrs, index };
}

const MAGIC = 0x32424847;
const TYPES = { f32: 0, i8: 1, u8: 2, u8i: 3 };
const BYTES = [4, 1, 1, 1];

export function encodeMesh(mesh, layout) {
  const nv = mesh.position.length / 3, ni = mesh.index.length, wide = nv > 65535;
  const pad = (n) => (n + 3) & ~3;
  let size = 32 + layout.length * 24 + pad(nv * 12) + pad(nv * 3);
  for (const a of layout) size += pad(nv * a.size * BYTES[TYPES[a.type]]);
  size += pad(ni * (wide ? 4 : 2));
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  [MAGIC, 2, nv, ni, layout.length, wide ? 1 : 0, mesh.split || 0, 0].forEach((v, i) => dv.setUint32(i * 4, v, true));
  let o = 32;
  for (const a of layout) {
    for (let c = 0; c < 20; c++) dv.setUint8(o + c, c < a.name.length ? a.name.charCodeAt(c) : 0);
    dv.setUint8(o + 20, a.size); dv.setUint8(o + 21, TYPES[a.type]); o += 24;
  }
  new Float32Array(buf, o, nv * 3).set(mesh.position); o += pad(nv * 12);
  const nn = new Int8Array(buf, o, nv * 3);
  for (let i = 0; i < nv * 3; i++) nn[i] = Math.round(clamp(mesh.normal[i], -1, 1) * 127);
  o += pad(nv * 3);
  for (const a of layout) {
    const src = mesh.attrs[a.name], t = TYPES[a.type], n = nv * a.size;
    if (t === 0) new Float32Array(buf, o, n).set(src);
    else if (t === 1) { const d = new Int8Array(buf, o, n); for (let i = 0; i < n; i++) d[i] = Math.round(clamp(src[i], -1, 1) * 127); }
    else if (t === 2) { const d = new Uint8Array(buf, o, n); for (let i = 0; i < n; i++) d[i] = Math.round(clamp(src[i], 0, 1) * 255); }
    else { const d = new Uint8Array(buf, o, n); for (let i = 0; i < n; i++) d[i] = clamp(Math.round(src[i]), 0, 255); }
    o += pad(n * BYTES[t]);
  }
  if (wide) new Uint32Array(buf, o, ni).set(mesh.index); else new Uint16Array(buf, o, ni).set(mesh.index);
  return buf;
}

export function decodeMesh(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad ghost mesh');
  const nv = dv.getUint32(8, true), ni = dv.getUint32(12, true), na = dv.getUint32(16, true), wide = dv.getUint32(20, true) === 1, split = dv.getUint32(24, true);
  const pad = (n) => (n + 3) & ~3;
  let o = 32;
  const layout = [];
  for (let a = 0; a < na; a++) {
    let name = '';
    for (let c = 0; c < 20; c++) { const ch = dv.getUint8(o + c); if (ch) name += String.fromCharCode(ch); }
    layout.push({ name, size: dv.getUint8(o + 20), type: dv.getUint8(o + 21) }); o += 24;
  }
  const position = new Float32Array(buf, o, nv * 3); o += pad(nv * 12);
  const normal = new Int8Array(buf, o, nv * 3); o += pad(nv * 3);
  const attrs = {};
  for (const a of layout) {
    const n = nv * a.size;
    const arr = a.type === 0 ? new Float32Array(buf, o, n) : a.type === 1 ? new Int8Array(buf, o, n) : new Uint8Array(buf, o, n);
    attrs[a.name] = { array: arr, size: a.size, normalized: a.type === 1 || a.type === 2 };
    o += pad(n * BYTES[a.type]);
  }
  const index = wide ? new Uint32Array(buf, o, ni) : new Uint16Array(buf, o, ni);
  return { nv, position, normal, attrs, index, split };
}

export function packMesh(mesh, layout) { return decodeMesh(encodeMesh(mesh, layout)); }
