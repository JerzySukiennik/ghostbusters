// GPS line on the road: a strip of white chevrons along the next stretch of the route, rebuilt a few times a second, scrolling toward the goal.
import * as THREE from 'three';

const MAX = 160, STEP = 2.5, LEN = 210, W = 1.7;

export class RouteLine {
  constructor(scene, heightAt = null) {
    this.heightAt = heightAt;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((MAX + 1) * 2 * 3);
    this.uv = new Float32Array((MAX + 1) * 2 * 2);
    const idx = [];
    for (let i = 0; i < MAX; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.u = { uTime: { value: 0 }, uLen: { value: LEN }, uS0: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uLen; uniform float uS0; varying vec2 vUv;
        void main(){
          float x = abs(vUv.x - 0.5) * 2.0;
          float y = fract(vUv.y / 3.2 - uTime * 0.9);
          float d = y + x * 0.42;
          float c = smoothstep(0.30, 0.36, d) * (1.0 - smoothstep(0.58, 0.64, d));
          float edge = 1.0 - smoothstep(0.86, 1.0, x);
          float r = vUv.y - uS0;
          float fade = smoothstep(4.0, 14.0, r) * (1.0 - smoothstep(uLen - 70.0, uLen, r));
          float a = (c * 0.85 + 0.07) * edge * fade;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.99, 0.95) * (1.0 + c * 0.6), a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = 0;
  }

  update(dt, gps, on) {
    this.u.uTime.value += dt;
    this.t -= dt;
    const vis = on && gps && gps.pts;
    this.mesh.visible = !!vis;
    if (!vis || this.t > 0) return;
    this.t = 0.12;
    const p = gps.pts, cum = gps.cum, s0 = gps.s, s1 = Math.min(gps.total, s0 + LEN);
    let i = 1, n = 0;
    const at = (s) => { while (i < p.length - 1 && cum[i] < s) i++; const k = Math.max(0, Math.min(1, (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1))); return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]; };
    let prev = at(s0);
    for (let s = s0; s <= s1 + 0.01 && n <= MAX; s += STEP) {
      const c = at(Math.min(s, s1)), nx = at(Math.min(s + STEP, gps.total));
      let dx = nx[0] - c[0], dz = nx[1] - c[1];
      if (Math.hypot(dx, dz) < 1e-3) { dx = c[0] - prev[0]; dz = c[1] - prev[1]; }
      const L = Math.hypot(dx, dz) || 1, rx = -dz / L * W * 0.5, rz = dx / L * W * 0.5;
      const y = (this.heightAt ? this.heightAt(c[0], c[1]) : 0) + 0.06;
      const o = n * 6, q = n * 4;
      this.pos[o] = c[0] - rx; this.pos[o + 1] = y; this.pos[o + 2] = c[1] - rz;
      this.pos[o + 3] = c[0] + rx; this.pos[o + 4] = y; this.pos[o + 5] = c[1] + rz;
      this.uv[q] = 0; this.uv[q + 1] = s; this.uv[q + 2] = 1; this.uv[q + 3] = s;
      prev = c; n++;
      if (s >= s1) break;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.u.uLen.value = Math.max(20, s1 - s0); this.u.uS0.value = s0;
  }
}
