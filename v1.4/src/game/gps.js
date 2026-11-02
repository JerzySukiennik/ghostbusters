// Ecto-1 GPS: A* over the city lane graph, live progress along the route, re-routing, maneuvers and the cues for Janine's turn callouts.
const CELL = 64;

function plen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }

function proj(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  const x = ax + dx * k, z = az + dz * k;
  return { k, x, z, d: Math.hypot(px - x, pz - z) };
}

export class GPS {
  constructor(roads, o = {}) {
    this.side = o.side || 0;
    this.nodes = new Map(); this.edges = []; this.grid = new Map();
    this.pts = null; this.cum = null; this.man = []; this.s = 0; this.total = 0; this.goal = null;
    this.off = 0; this.back = 0; this.cool = 0; this.idx = 0; this.said = new Set(); this.events = [];
    for (const n of roads.nodes || []) this.nodes.set(n.id, { id: n.id, x: n.p[0], z: n.p[1], out: [] });
    for (const l of roads.lanes || []) {
      const a = this.nodes.get(l.from), b = this.nodes.get(l.to);
      if (!a || !b) continue;
      let pts = (l.pts || []).map((p) => [p[0], p[1]]);
      if (!pts.length || Math.hypot(pts[0][0] - a.x, pts[0][1] - a.z) > 0.5) pts.unshift([a.x, a.z]);
      if (Math.hypot(pts[pts.length - 1][0] - b.x, pts[pts.length - 1][1] - b.z) > 0.5) pts.push([b.x, b.z]);
      this.add(a, b, pts, l, 1);
      if (!l.oneWay) this.add(b, a, pts.slice().reverse(), l, 1);
      else this.add(b, a, pts.slice().reverse(), l, 4);
    }
  }

  add(a, b, pts, lane, cost) {
    const e = { from: a, to: b, pts, len: plen(pts), cost, name: lane.name || lane.street || '', cum: [0] };
    for (let i = 1; i < pts.length; i++) e.cum.push(e.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    a.out.push(e); this.edges.push(e);
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const cx0 = Math.floor(Math.min(x0, x1) / CELL), cx1 = Math.floor(Math.max(x0, x1) / CELL), cz0 = Math.floor(Math.min(z0, z1) / CELL), cz1 = Math.floor(Math.max(z0, z1) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx + ',' + cz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push({ e, i });
      }
    }
  }

  snap(x, z, fx = 0, fz = 0, r = 2) {
    let best = null, bs = Infinity;
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (const { e, i } of this.grid.get(gx + dx + ',' + (gz + dz)) || []) {
      const a = e.pts[i - 1], b = e.pts[i], p = proj(x, z, a[0], a[1], b[0], b[1]);
      const sl = e.cum[i] - e.cum[i - 1] || 1;
      const al = fx || fz ? ((b[0] - a[0]) * fx + (b[1] - a[1]) * fz) / sl : 1;
      const score = p.d + (1 - al) * 9 + (e.cost - 1) * 6;
      if (score < bs) { bs = score; best = { e, t: e.cum[i - 1] + p.k * sl, d: p.d, x: p.x, z: p.z }; }
    }
    return best;
  }

  route(from, to) {
    const s = this.snap(from.x, from.z, from.fx, from.fz), g = this.snap(to.x, to.z);
    this.goal = { x: to.x, z: to.z };
    if (!s || !g) { this.clear(); return false; }
    const path = this.search(s, g);
    if (!path) { this.clear(); return false; }
    const pts = [[from.x, from.z]];
    const push = (p) => { const q = pts[pts.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3) pts.push(p); };
    const man = [];
    if (path.length === 0) {
      this.walk(s.e, s.t, g.t, push);
    } else {
      this.walk(s.e, s.t, s.e.len, push);
      for (let i = 0; i < path.length; i++) {
        const e = path[i], last = i === path.length - 1 && e === g.e;
        man.push({ at: pts.length - 1, prev: i === 0 ? s.e : path[i - 1], next: e });
        this.walk(e, 0, last ? g.t : e.len, push);
      }
      if (path[path.length - 1] !== g.e) { man.push({ at: pts.length - 1, prev: path[path.length - 1], next: g.e }); this.walk(g.e, 0, g.t, push); }
    }
    push([g.x, g.z]);
    if (this.side && pts.length > 2) {
      pts.shift();
      for (const m of man) m.at = Math.max(0, m.at - 1);
      const r = (i) => { const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; };
      const segs = []; for (let i = 0; i < pts.length - 1; i++) segs.push(r(i));
      const out = pts.map((p, i) => {
        const a = segs[Math.max(0, i - 1)], b = segs[Math.min(segs.length - 1, i)];
        let nx = a[0] + b[0], nz = a[1] + b[1]; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
        const k = this.side / Math.max(0.5, nx * b[0] + nz * b[1]);
        return [p[0] + nx * k, p[1] + nz * k];
      });
      pts.splice(0, pts.length, ...out);
    }
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.total = this.cum[pts.length - 1];
    this.man = [];
    for (const m of man) {
      const i = m.at, a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
      const back = this.dirAt(i, -1), fwd = this.dirAt(i, 1);
      if (!back || !fwd) continue;
      const ang = Math.atan2(back[0] * fwd[1] - back[1] * fwd[0], back[0] * fwd[0] + back[1] * fwd[1]);
      const deg = Math.abs(ang) * 180 / Math.PI;
      if (deg < 22 || !a || !b || !c) continue;
      const side = ang > 0 ? 'right' : 'left';
      this.man.push({ s: this.cum[i], type: deg > 150 ? 'uturn' : deg < 50 ? 'bear_' + side : side, street: m.next.name !== m.prev.name ? m.next.name : '' });
    }
    this.s = 0; this.idx = 0; this.off = 0; this.back = 0; this.said.clear();
    return true;
  }

  dirAt(i, sgn) {
    const p = this.pts, o = p[i];
    for (let j = i + sgn; j >= 0 && j < p.length; j += sgn) {
      const dx = (p[j][0] - o[0]) * sgn, dz = (p[j][1] - o[1]) * sgn, L = Math.hypot(dx, dz);
      if (L > 4) return [dx / L, dz / L];
    }
    return null;
  }

  walk(e, t0, t1, push) {
    for (let i = 1; i < e.pts.length; i++) {
      if (e.cum[i] <= t0) continue;
      if (e.cum[i - 1] >= t1) break;
      const sl = e.cum[i] - e.cum[i - 1] || 1, a = e.pts[i - 1], b = e.pts[i];
      const k0 = Math.max(0, (t0 - e.cum[i - 1]) / sl), k1 = Math.min(1, (t1 - e.cum[i - 1]) / sl);
      if (k0 > 0) push([a[0] + (b[0] - a[0]) * k0, a[1] + (b[1] - a[1]) * k0]);
      push([a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1]);
    }
  }

  search(s, g) {
    if (s.e === g.e && g.t >= s.t) return [];
    const start = s.e.to, goal = g.e.from, h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z);
    const dist = new Map([[start, s.e.len - s.t]]), prev = new Map(), open = [[dist.get(start) + h(start), start]], done = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, n] = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (done.has(n)) continue;
      done.add(n);
      if (n === goal) break;
      for (const e of n.out) {
        const nd = dist.get(n) + e.len * e.cost;
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, e); open.push([nd + h(e.to), e.to]); }
      }
    }
    if (!done.has(goal)) return null;
    const path = [];
    for (let n = goal; n !== start; ) { const e = prev.get(n); if (!e) return null; path.unshift(e); n = e.from; }
    path.push(g.e);
    return path;
  }

  clear() { this.pts = null; this.man = []; this.total = 0; this.s = 0; }

  update(dt, car) {
    this.events.length = 0;
    if (!this.pts) return this.events;
    this.cool = Math.max(0, this.cool - dt);
    const p = this.pts, n = p.length;
    let bd = Infinity, bs = this.s, bi = this.idx;
    for (let i = Math.max(1, this.idx - 2); i < Math.min(n, this.idx + 40); i++) {
      const q = proj(car.x, car.z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
      if (q.d < bd) { bd = q.d; bi = i; bs = this.cum[i - 1] + q.k * (this.cum[i] - this.cum[i - 1]); }
    }
    this.idx = bi; this.s = Math.max(this.s - 5, bs);
    const seg = [p[bi][0] - p[bi - 1][0], p[bi][1] - p[bi - 1][1]], sl = Math.hypot(seg[0], seg[1]) || 1;
    const along = (seg[0] * car.fx + seg[1] * car.fz) / sl;
    this.off = bd > 26 ? this.off + dt : 0;
    this.back = along < -0.5 && car.speed > 3 ? this.back + dt : 0;
    if (this.off > 1.2 && this.cool <= 0) { this.events.push('recalc'); this.cool = 4; this.route(car, this.goal); return this.events; }
    if (this.back > 3 && !this.said.has('uturn@' + Math.round(this.s / 50))) { this.said.add('uturn@' + Math.round(this.s / 50)); this.events.push('uturn'); }
    const rem = this.total - this.s;
    if (rem < 70 && !this.said.has('close') && this.total > 120) { this.said.add('close'); this.events.push('close'); }
    if (rem < 22 && !this.said.has('arrive')) {
      this.said.add('arrive');
      const gx = this.goal.x - car.x, gz = this.goal.z - car.z, cr = car.fx * gz - car.fz * gx;
      this.events.push(Math.hypot(gx, gz) > 8 ? (cr > 0 ? 'on_right' : 'on_left') : 'arrive');
    }
    const ahead = Math.max(60, Math.min(140, 45 + car.speed * 3.2)), now = Math.max(16, Math.min(34, 8 + car.speed * 1.1));
    for (const m of this.man) {
      const d = m.s - this.s;
      if (d < -5) continue;
      const key = Math.round(m.s);
      if (d < now && !this.said.has('now' + key)) { this.said.add('now' + key); this.said.add('next' + key); this.events.push(m.type + '_now'); }
      else if (d < ahead && d > now + 12 && !this.said.has('next' + key)) { this.said.add('next' + key); this.events.push(m.type + '_next'); }
      break;
    }
    return this.events;
  }

  next() {
    for (const m of this.man) if (m.s - this.s > -3) return { type: m.type, street: m.street, dist: m.s - this.s };
    return null;
  }
}
