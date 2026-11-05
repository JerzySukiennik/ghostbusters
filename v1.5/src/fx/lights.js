// Light pool: the only PointLights FX owns (created once), handed out per frame by priority.
import * as THREE from 'three';

export class LightPool {
  constructor(parent, count = 4) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 30, 2);
      l.castShadow = false;
      l.name = 'FXLight' + i;
      parent.add(l);
      this.lights.push(l);
    }
    this.max = 24;
    this.n = 0;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.inten = new Float32Array(this.max);
    this.score = new Float32Array(this.max);
    this.range = new Float32Array(this.max);
    this.order = new Int32Array(count);
    this.scale = 1;
  }

  request(p, r, g, b, intensity, priority, range = 30) {
    if (!(intensity > 0.001) || this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.inten[i] = intensity;
    this.score[i] = priority * 1000 + Math.min(999, intensity);
    this.range[i] = range;
  }

  flush() {
    const L = this.lights, cnt = L.length, ord = this.order, sc = this.score;
    for (let k = 0; k < cnt; k++) ord[k] = -1;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k < cnt; k++) {
        const j = ord[k];
        if (j < 0 || sc[i] > sc[j]) {
          for (let m = cnt - 1; m > k; m--) ord[m] = ord[m - 1];
          ord[k] = i;
          break;
        }
      }
    }
    for (let k = 0; k < cnt; k++) {
      const l = L[k], j = ord[k];
      if (j < 0) { l.intensity = 0; continue; }
      l.position.set(this.pos[j * 3], this.pos[j * 3 + 1], this.pos[j * 3 + 2]);
      l.color.setRGB(this.col[j * 3], this.col[j * 3 + 1], this.col[j * 3 + 2]);
      l.intensity = this.inten[j] * this.scale;
      l.distance = this.range[j];
    }
    this.n = 0;
  }
}
