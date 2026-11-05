// World-pinned markers: a diamond with the key, a label and a stem down to the anchor, projected every frame and clamped to the screen edge when off view.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Markers {
  constructor(root) { this.root = root; this.pool = new Map(); this.tick = 0; }

  put(id, pos, o) {
    let m = this.pool.get(id);
    if (!m) { m = this.make(); this.pool.set(id, m); }
    m.seen = this.tick; m.pos.copy(pos);
    m.kind = o.kind || 'use'; m.k = o.key || ''; m.l = o.label || ''; m.d = o.dist ?? -1;
    m.edge = !!o.edge; m.dim = !!o.dim; m.offOnly = !!o.offOnly;
  }

  make() {
    const el = document.createElement('div');
    el.className = 'mk';
    el.innerHTML = '<i class="arw"></i><div class="in"><div class="d"><b></b></div><div class="l"><span></span><em></em></div><div class="stem"></div></div>';
    this.root.append(el);
    return { el, kEl: el.querySelector('.d b'), lEl: el.querySelector('.l span'), dEl: el.querySelector('.l em'), arw: el.querySelector('.arw'), pos: new THREE.Vector3(), seen: -1, s: {} };
  }

  set(m, k, v, fn) { if (m.s[k] !== v) { m.s[k] = v; fn(v); } }

  hide(m) { this.set(m, 'cls', 'mk', (v) => (m.el.className = v)); }

  update(camera, w, h) {
    camera.updateMatrixWorld();
    const pad = Math.max(44, w * 0.04);
    for (const m of this.pool.values()) {
      if (m.seen !== this.tick) { this.hide(m); continue; }
      _v.copy(m.pos).applyMatrix4(camera.matrixWorldInverse);
      const cx = _v.x, cy = _v.y, behind = _v.z > -0.2;
      let x = 0, y = 0, off = behind;
      if (!behind) {
        _v.applyMatrix4(camera.projectionMatrix);
        x = (_v.x * 0.5 + 0.5) * w; y = (0.5 - _v.y * 0.5) * h;
        off = x < pad || x > w - pad || y < pad || y > h - pad;
      }
      if ((off && !m.edge) || (!off && m.offOnly)) { this.hide(m); continue; }
      if (off) {
        const dx = behind ? cx : x - w / 2, dy = behind ? Math.abs(cy) + Math.abs(_v.z) * 0.6 + 0.01 : y - h / 2;
        const s = Math.min((w / 2 - pad) / Math.max(1e-4, Math.abs(dx)), (h / 2 - pad) / Math.max(1e-4, Math.abs(dy)));
        x = w / 2 + dx * s; y = h / 2 + dy * s;
        m.arw.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad) translateX(30px)`;
      }
      this.set(m, 'cls', `mk on ${m.kind}${m.dim ? ' dim' : ''}${off ? ' edge' : ''}`, (v) => (m.el.className = v));
      this.set(m, 'k', m.k, (v) => (m.kEl.textContent = v));
      this.set(m, 'l', m.l, (v) => (m.lEl.textContent = v));
      this.set(m, 'd', m.d < 0 ? '' : Math.round(m.d) + ' m', (v) => (m.dEl.textContent = v));
      m.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
    this.tick++;
  }
}
