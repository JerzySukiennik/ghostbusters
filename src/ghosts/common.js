// Shared helpers for ghost behaviour modules: nearest player, prop picking, route following, car-like and ground steering, swoop hit tests. No allocations per call.
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const _a = V();

export function nearestPlayer(g, ctx, out) {
  const P = ctx.players;
  if (P && P.length) {
    let best = P[0], bd = Infinity;
    for (let i = 0; i < P.length; i++) { const d = P[i].distanceToSquared(g.pos); if (d < bd) { bd = d; best = P[i]; } }
    return out.copy(best);
  }
  if (ctx.playerHead) return out.copy(ctx.playerHead);
  return out.copy(g.pos).add(_a.set(0, 0, 5));
}

export function propsOf(g, ctx) { return ctx.props || (g.plate && g.plate.props) || []; }

export function pickProp(g, ctx, maxDist = 30, tries = 10) {
  const L = propsOf(g, ctx);
  if (!L.length) return null;
  let best = null, bd = maxDist * maxDist;
  for (let i = 0; i < tries; i++) {
    const p = L[(Math.random() * L.length) | 0];
    if (!p || p.dead || p.broken || !p.body) continue;
    const t = p.object3D ? p.object3D.position : p.body.translation();
    const dx = t.x - g.pos.x, dz = t.z - g.pos.z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function propPos(p, out) {
  const t = p.object3D ? p.object3D.position : p.body.translation();
  return out.set(t.x, t.y, t.z);
}

export function groundAt(ctx, x, z) { return ctx.groundAt ? ctx.groundAt(x, z) : 0; }

export function followRoute(g, dt, speed, k, reach = 1.5) {
  const R = g.route;
  if (!R || !R.length) return;
  const w = R[g.wp % R.length];
  g.steer(w, speed, k, dt);
  _a.set(w.x - g.pos.x, 0, w.z - g.pos.z);
  if (_a.lengthSq() < reach * reach) g.wp = (g.wp + 1 + (Math.random() < 0.25 ? 1 : 0)) % R.length;
}

export function routePoint(g) { const R = g.route; return R && R.length ? R[g.wp % R.length] : g.pos; }

export function advanceRoute(g, reach) {
  const w = routePoint(g);
  const dx = w.x - g.pos.x, dz = w.z - g.pos.z;
  if (dx * dx + dz * dz < reach * reach) g.wp = (g.wp + 1) % Math.max(1, g.route.length);
}

export function heading(g) {
  if (g.heading === undefined) g.heading = Math.atan2(g.lookDir ? g.lookDir.x : 0, g.lookDir ? g.lookDir.z : 1);
  return g.heading;
}

export function drive(g, dt, tx, tz, speed, turnRate, accel = 3) {
  let h = heading(g);
  const want = Math.atan2(tx - g.pos.x, tz - g.pos.z);
  let d = want - h;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const slow = 1 - 0.55 * clamp(Math.abs(d) / 1.6, 0, 1);
  h += clamp(d, -turnRate * dt, turnRate * dt);
  g.heading = h;
  const s = speed * slow;
  const k = 1 - Math.exp(-dt * accel);
  g.vel.x += (Math.sin(h) * s - g.vel.x) * k;
  g.vel.z += (Math.cos(h) * s - g.vel.z) * k;
  return d;
}

export function stickToGround(g, ctx, floor, dt) {
  const gy = groundAt(ctx, g.pos.x, g.pos.z) + floor;
  g.pos.y += (gy - g.pos.y) * Math.min(1, dt * 14);
  g.vel.y = 0;
}

export function hitPlayers(g, ctx, radius) {
  const P = ctx.players;
  if (P && P.length) {
    for (let i = 0; i < P.length; i++) {
      const bit = 1 << i;
      if (g.slimedMask & bit) continue;
      if (P[i].distanceTo(g.pos) < radius) { g.slimedMask |= bit; if (ctx.onSlime) ctx.onSlime(i, g); }
    }
  } else if (ctx.playerHead && !(g.slimedMask & 1) && ctx.playerHead.distanceTo(g.pos) < radius) { g.slimedMask |= 1; if (ctx.onSlime) ctx.onSlime(0, g); }
}

export function voice(beh, name) { return (beh.voice && beh.voice[name]) || name; }

export const MOOD = { eat: 'eat', roam: 'idle', prank: 'taunt', taunt: 'taunt', windup: 'angry', swoop: 'angry', flee: 'flee', stagger: 'hurt', wrangled: 'wrangled', slammed: 'hurt', sucked: 'sucked' };
