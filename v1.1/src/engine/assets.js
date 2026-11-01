// GLB and texture loading with cache, progress and graceful null on missing files.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class Assets {
  constructor(onProgress) {
    this.manager = new THREE.LoadingManager();
    this.gltf = new GLTFLoader(this.manager);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.tex = new THREE.TextureLoader(this.manager);
    this.cache = new Map();
    this.total = 0; this.done = 0;
    this.onProgress = onProgress || (() => {});
  }

  async exists(url) {
    try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; }
  }

  track(p, label) {
    this.total++;
    this.onProgress(this.done / this.total, label);
    return p.finally(() => { this.done++; this.onProgress(this.done / this.total, label); });
  }

  glb(url, label = url) {
    if (this.cache.has(url)) return this.cache.get(url);
    const p = this.track(this.exists(url).then((ok) => (ok ? this.gltf.loadAsync(url) : null)).catch((e) => { console.warn('[assets] failed', url, e?.message || e); return null; }), label);
    this.cache.set(url, p);
    return p;
  }

  json(url) {
    return fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }

  texture(url, srgb = true) {
    return this.tex.loadAsync(url).then((t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => null);
  }
}

export function findNode(root, name) {
  let out = null;
  const n2 = name.replace(/[\s.]/g, '_');
  root.traverse((o) => { if (!out && (o.name === name || o.name === n2)) out = o; });
  return out;
}

export function findAll(root, re) {
  const out = [];
  root.traverse((o) => { if (re.test(o.name)) out.push(o); });
  return out;
}
