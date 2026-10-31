// Procedural FX textures built once at load: tileable noise, smoke puff, scorch, slime splat, lens slime.
import * as THREE from 'three';
import { Rng, clamp, smooth } from './util.js';

function lattice(rng, n) { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rng.next(); return a; }

function tileNoise(lat, n, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % n) + n) % n, y0 = ((yi % n) + n) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
  const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function fbmField(rng, size, base, oct) {
  const lats = [];
  for (let o = 0; o < oct; o++) lats.push(lattice(rng, base << o));
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) {
      const n = base << o;
      v += tileNoise(lats[o], n, (x / size) * n, (y / size) * n) * amp; tot += amp; amp *= 0.5;
    }
    out[y * size + x] = v / tot;
  }
  return out;
}

function toTexture(data, size, { repeat = false, mip = true } = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function stretch(f) {
  let lo = 1, hi = 0;
  for (let i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
  const k = 1 / Math.max(1e-4, hi - lo);
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
  return f;
}

function blur(src, size, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0; for (let i = -r; i <= r; i++) s += src[y * size + clamp(x + i, 0, size - 1)]; tmp[y * size + x] = s * k;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0; for (let i = -r; i <= r; i++) s += tmp[clamp(y + i, 0, size - 1) * size + x]; out[y * size + x] = s * k;
  }
  return out;
}

export function makeNoiseTexture(seed = 7, size = 256) {
  const rng = new Rng(seed);
  const a = stretch(fbmField(rng, size, 4, 5)), b = stretch(fbmField(rng, size, 8, 4)), c = stretch(fbmField(rng, size, 16, 3)), d = stretch(fbmField(rng, size, 32, 2));
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = d[i] * 255;
  }
  return toTexture(data, size, { repeat: true });
}

export function makeSmokeTexture(seed = 11, size = 128) {
  const rng = new Rng(seed);
  const n = stretch(fbmField(rng, size, 4, 5)), m = stretch(fbmField(rng, size, 8, 4));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
    const r = Math.sqrt(u * u + v * v);
    const dens = clamp(smooth(1.0, 0.25, r + (n[i] - 0.5) * 0.7) * (0.55 + 0.6 * m[i]), 0, 1);
    const lit = clamp(0.5 + (-u * 0.45 + v * 0.55) * 0.6 + (n[i] - 0.5) * 0.6, 0, 1);
    data[i * 4] = dens * 255; data[i * 4 + 1] = lit * 255; data[i * 4 + 2] = m[i] * 255; data[i * 4 + 3] = 255;
  }
  return toTexture(data, size);
}

export function makeScorchTexture(seed = 23, size = 256) {
  const rng = new Rng(seed);
  const n = stretch(fbmField(rng, size, 6, 5)), c = stretch(fbmField(rng, size, 24, 3));
  const rays = new Float32Array(64); for (let i = 0; i < 64; i++) rays[i] = rng.next();
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
    const r = Math.sqrt(u * u + v * v);
    const ang = (Math.atan2(v, u) / (Math.PI * 2) + 0.5) * 64;
    const ai = Math.floor(ang) % 64, af = ang - Math.floor(ang);
    const ray = rays[ai] * (1 - af) + rays[(ai + 1) % 64] * af;
    const edge = r + (n[i] - 0.5) * 0.45 - ray * 0.18;
    const soot = smooth(0.95, 0.25, edge) * (0.65 + 0.35 * n[i]);
    const hot = smooth(0.42, 0.0, r + (n[i] - 0.5) * 0.25);
    const crack = smooth(0.62, 0.8, c[i]) * smooth(0.7, 0.2, r);
    data[i * 4] = clamp(soot, 0, 1) * 255; data[i * 4 + 1] = clamp(hot, 0, 1) * 255; data[i * 4 + 2] = clamp(crack, 0, 1) * 255; data[i * 4 + 3] = n[i] * 255;
  }
  return toTexture(data, size);
}

function metaField(size, blobs, n, warp) {
  const f = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const u = (x + 0.5) / size * 2 - 1 + (n[i] - 0.5) * warp, v = (y + 0.5) / size * 2 - 1 + (n[(i * 7) % n.length] - 0.5) * warp;
    let s = 0;
    for (let b = 0; b < blobs.length; b += 5) {
      const dx = u - blobs[b], dy = v - blobs[b + 1];
      const ca = Math.cos(blobs[b + 4]), sa = Math.sin(blobs[b + 4]);
      const ax = (dx * ca + dy * sa) / blobs[b + 2], ay = (-dx * sa + dy * ca) / blobs[b + 3];
      const d2 = ax * ax + ay * ay;
      if (d2 < 4) s += Math.exp(-d2 * 2.2);
    }
    f[i] = s;
  }
  return f;
}

export function makeSlimeSplatTexture(seed = 31, size = 256) {
  const rng = new Rng(seed);
  const n = stretch(fbmField(rng, size, 8, 4));
  const blobs = [0, 0, 0.42, 0.38, 0];
  const arms = 7 + rng.int(4);
  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2 + rng.range(-0.3, 0.3), d = rng.range(0.32, 0.55);
    blobs.push(Math.cos(ang) * d, Math.sin(ang) * d, rng.range(0.16, 0.26), rng.range(0.07, 0.12), ang);
    blobs.push(Math.cos(ang) * (d + 0.22), Math.sin(ang) * (d + 0.22), rng.range(0.05, 0.09), rng.range(0.05, 0.08), ang);
  }
  for (let k = 0; k < 18; k++) {
    const ang = rng.range(0, Math.PI * 2), d = rng.range(0.6, 0.92), r = rng.range(0.025, 0.06);
    blobs.push(Math.cos(ang) * d, Math.sin(ang) * d, r, r * rng.range(0.8, 1.4), ang);
  }
  const f = blur(metaField(size, blobs, n, 0.12), size, 1);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const cov = smooth(0.32, 0.5, f[i]);
    const h = clamp((f[i] - 0.32) * 1.2, 0, 1);
    data[i * 4] = cov * 255; data[i * 4 + 1] = Math.sqrt(h) * 255; data[i * 4 + 2] = n[i] * 255; data[i * 4 + 3] = 255;
  }
  return toTexture(data, size);
}

export function makeLensSlimeTexture(seed = 47, size = 512) {
  const rng = new Rng(seed);
  const n = stretch(fbmField(rng, size, 8, 5));
  const blobs = [];
  const big = 5 + rng.int(3);
  for (let k = 0; k < big; k++) {
    const x = rng.range(-0.85, 0.85), y = rng.range(-0.5, 0.75), r = rng.range(0.14, 0.3);
    blobs.push(x, y, r, r * rng.range(0.7, 1.2), rng.range(0, 3.14));
    const drips = 1 + rng.int(3);
    for (let d = 0; d < drips; d++) {
      const dx = x + rng.range(-r * 0.6, r * 0.6), len = rng.range(0.12, 0.4), w = rng.range(0.025, 0.045);
      blobs.push(dx, y - r * 0.5 - len * 0.5, w, len * 0.5, Math.PI / 2);
      blobs.push(dx, y - r * 0.5 - len, w * 1.5, w * 1.7, 0);
    }
  }
  for (let k = 0; k < 40; k++) { const r = rng.range(0.01, 0.035); blobs.push(rng.range(-0.95, 0.95), rng.range(-0.9, 0.95), r, r, 0); }
  const f = blur(metaField(size, blobs, n, 0.06), size, 2);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const cov = smooth(0.3, 0.55, f[i]);
    const h = clamp((f[i] - 0.3) * 0.9, 0, 1);
    data[i * 4] = cov * 255; data[i * 4 + 1] = Math.sqrt(h) * 255; data[i * 4 + 2] = n[i] * 255; data[i * 4 + 3] = (1 - (y / size)) * 255;
  }
  const t = toTexture(data, size, { mip: false });
  t.flipY = false;
  return t;
}

export function createTextures() {
  return {
    noise: makeNoiseTexture(),
    smoke: makeSmokeTexture(),
    scorch: makeScorchTexture(),
    slime: makeSlimeSplatTexture(),
    lens: makeLensSlimeTexture(),
  };
}
