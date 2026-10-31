// FX helpers: seeded RNG, small math, style constants.
export class Rng {
  constructor(seed = 1) { this.s = seed | 0; }
  seed(s) { this.s = s | 0; }
  next() {
    this.s = (this.s + 0x6D2B79F5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  signed() { return this.next() * 2 - 1; }
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

export const QUALITY = {
  low: { name: 'low', seg: 380, sparks: 768, embers: 256, smoke: 160, chips: 128, slime: 192, motes: 256, decals: 32, ghostRes: 56, haze: false, arcs: 6 },
  medium: { name: 'medium', seg: 640, sparks: 1536, embers: 512, smoke: 256, chips: 192, slime: 320, motes: 512, decals: 48, ghostRes: 72, haze: true, arcs: 8 },
  high: { name: 'high', seg: 900, sparks: 3072, embers: 1024, smoke: 384, chips: 256, slime: 512, motes: 768, decals: 64, ghostRes: 88, haze: true, arcs: 10 },
};

export const RO = { ghost: 20, decal: 5, smoke: 30, glow: 40, add: 50, flare: 60 };
