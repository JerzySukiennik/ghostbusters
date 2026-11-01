// Round minimap: the street map is drawn once, then rotated with the camera every frame; car, teammates, ghosts, the goal and the GPS route on top.
export class Minimap {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d');
    this.map = null; this.route = null; this.size = 0; this.dpr = 1;
  }

  setMap(data) {
    if (!data) return;
    const b = data.bounds;
    const [x0, z0, x1, z1] = Array.isArray(b) ? b : [b.minX, b.minZ, b.maxX, b.maxZ];
    const ex = x1 - x0, ez = z1 - z0;
    const S = Math.min(3, Math.sqrt(8e6 / (ex * ez)), 4096 / Math.max(ex, ez));
    const off = document.createElement('canvas');
    off.width = Math.ceil(ex * S); off.height = Math.ceil(ez * S);
    const c = off.getContext('2d');
    c.scale(S, S); c.translate(-x0, -z0);
    const path = (pts, close) => { c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z))); if (close) c.closePath(); };
    const shape = (s) => (Array.isArray(s) && s.length === 4 && typeof s[0] === 'number' ? [[s[0], s[1]], [s[2], s[1]], [s[2], s[3]], [s[0], s[3]]] : s.pts || s);
    c.fillStyle = 'rgba(110,160,190,.22)';
    for (const w of data.water || []) { path(shape(w), true); c.fill(); }
    c.fillStyle = 'rgba(140,210,140,.12)';
    for (const p of data.parks || []) { path(shape(p), true); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.09)';
    for (const k of data.blocks || []) { path(shape(k), true); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of data.roads || []) { c.lineWidth = r.w || data.roadW || 10; path(r.pts || r, false); c.stroke(); }
    this.map = { off, S, x0, z0 };
  }

  setRoute(pts, i0 = 0) { this.route = pts && pts.length > 1 ? pts : null; this.r0 = Math.max(0, Math.min(i0, (pts?.length || 2) - 2)); }

  fit() {
    const css = this.cv.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
    if (css === this.size && dpr === this.dpr) return;
    this.size = css; this.dpr = dpr;
    this.cv.width = this.cv.height = Math.max(2, Math.round(css * dpr));
  }

  draw(v) {
    this.fit();
    const c = this.c, W = this.cv.width, R = W / 2, d = this.dpr, ppm = (R - 2 * d) / v.range;
    const rot = -Math.PI / 2 - Math.atan2(v.fz, v.fx), cs = Math.cos(rot), sn = Math.sin(rot);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - d, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(0,0,0,.66)'; c.fillRect(0, 0, W, W);
    c.translate(R, R); c.rotate(rot); c.scale(ppm, ppm); c.translate(-v.x, -v.z);
    const m = this.map;
    if (m) c.drawImage(m.off, m.x0, m.z0, m.off.width / m.S, m.off.height / m.S);
    if (this.route) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); const r = this.route; c.moveTo(r[this.r0][0], r[this.r0][1]); for (let i = this.r0 + 1; i < r.length; i++) c.lineTo(r[i][0], r[i][1]);
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 9 * d / ppm; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 4.5 * d / ppm; c.stroke();
    }
    if (v.car && !v.inCar) {
      c.save(); c.translate(v.car.x, v.car.z); c.rotate(Math.atan2(v.car.fz, v.car.fx) - Math.PI / 2);
      c.fillStyle = '#fff'; c.fillRect(-1.3, -3.4, 2.6, 6.8);
      c.restore();
    }
    c.restore();
    const dot = (x, z, clamp) => {
      const dx = (x - v.x) * ppm, dz = (z - v.z) * ppm;
      let sx = dx * cs - dz * sn, sy = dx * sn + dz * cs;
      const L = Math.hypot(sx, sy), lim = R - 9 * d;
      if (L > lim) { if (!clamp) return null; sx *= lim / L; sy *= lim / L; }
      return [R + sx, R + sy];
    };
    for (const p of v.mates || []) { const q = dot(p.x, p.z, true); if (q) { c.fillStyle = '#fff'; c.beginPath(); c.arc(q[0], q[1], 3.2 * d, 0, 7); c.fill(); } }
    for (const g of v.ghosts || []) {
      const q = dot(g.x, g.z, true); if (!q) continue;
      c.fillStyle = '#9dff6a'; c.shadowColor = '#9dff6a'; c.shadowBlur = 8 * d;
      c.beginPath(); c.arc(q[0], q[1], 4.2 * d, 0, 7); c.fill(); c.shadowBlur = 0;
    }
    if (v.goal) {
      const q = dot(v.goal.x, v.goal.z, true);
      if (q) { c.save(); c.translate(q[0], q[1]); c.rotate(Math.PI / 4); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5 * d; c.fillRect(-4.5 * d, -4.5 * d, 9 * d, 9 * d); c.strokeRect(-4.5 * d, -4.5 * d, 9 * d, 9 * d); c.restore(); }
    }
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5 * d;
    c.beginPath(); c.moveTo(R, R - 8 * d); c.lineTo(R + 6 * d, R + 7 * d); c.lineTo(R, R + 3.5 * d); c.lineTo(R - 6 * d, R + 7 * d); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.5 * d;
    c.beginPath(); c.arc(R, R, R - d * 1.2, 0, Math.PI * 2); c.stroke();
    c.save(); c.translate(R + sn * (R - 11 * d), R - cs * (R - 11 * d));
    c.fillStyle = '#fff'; c.font = `${11 * d}px Anton, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', 0, 0);
    c.restore();
  }
}
