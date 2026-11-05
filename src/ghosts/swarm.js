// Swarm behaviour: 3-6 small vapour ghosts flock around a leader on the route, dart at props, orbit a player's head, dive-bomb, scatter when hit so the crew catches them one by one.
import { V, rnd, nearestPlayer, pickProp, propPos, followRoute, hitPlayers, MOOD } from './common.js';

const _a = V(), _b = V(), _c = V(), _t = V(), _d = V();

function members(g, ctx) {
  const L = ctx.ghosts;
  return L && L.length ? L : null;
}

function isLive(o) { return o && o.type === 'swarm' && o.active && o.alive && o.state !== 'sucked' && o.state !== 'captured'; }

function flock(g, ctx, dt, speed, spread) {
  const L = members(g, ctx);
  let leader = g, n = 0;
  _a.set(0, 0, 0);
  _b.set(0, 0, 0);
  if (L) {
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      if (!isLive(o)) continue;
      if (o.id < leader.id) leader = o;
      _a.add(o.pos); n++;
      if (o === g) continue;
      _c.copy(g.pos).sub(o.pos);
      const d = _c.length();
      if (d < 1.1 && d > 1e-3) _b.addScaledVector(_c, (1.1 - d) / d * 6);
    }
  }
  if (leader === g || n <= 1) {
    followRoute(g, dt, speed, 1.8);
    g.vel.addScaledVector(_b, dt);
    return;
  }
  _a.multiplyScalar(1 / n);
  const k = g.id * 2.39996 + g.t * (0.9 + (g.id % 3) * 0.25);
  _c.set(Math.sin(k) * spread, Math.sin(k * 1.7) * 0.5 + 0.3, Math.cos(k) * spread).add(leader.pos);
  _c.lerp(_a, 0.25);
  g.steer(_c, speed * 1.25, 2.4, dt);
  g.vel.addScaledVector(_b, dt);
}

export default {
  type: 'swarm',
  name: 'Vapour Swarm',
  cls: 2,
  clsName: 'Class II Vapour Swarm',
  radius: 0.26,
  will: 30,
  speed: 6.5,
  bounty: 300,
  count: [3, 6],
  prefers: ['outdoor', 'indoor', 'subway'],
  floor: null,
  ground: false,
  voice: { ghost_laugh: 'swarm_chitter', ghost_roar: 'swarm_chitter', ghost_wail: 'swarm_chitter', ghost_hurt: 'swarm_chitter', ghost_whoosh: 'ghost_whoosh' },

  init(g) {
    g.fxx = null;
    g.slimedMask = 0;
    g.chitT = rnd(1, 4);
    g.prankT = rnd(4, 14);
    g.tauntT = rnd(6, 16);
    g.swoopCd = rnd(8, 18);
  },

  step(g, dt, ctx) {
    const target = nearestPlayer(g, ctx, _t);
    const dP = _d.copy(target).sub(g.pos).length();
    g.chitT -= dt;
    if (g.chitT <= 0) { g.chitT = rnd(2.5, 6); g.say('swarm_chitter', 0.6); g.mouth = 1; }
    switch (g.state) {
      case 'eat': {
        const k = g.id * 2.39996 + g.t * 1.1;
        _a.copy(g.cart).add(_b.set(Math.sin(k) * 1.4, 1.4 + Math.sin(k * 1.9) * 0.4, Math.cos(k) * 1.4));
        g.steer(_a, 3, 3, dt);
        if (ctx.engaged && (dP < 12 || g.st > 10)) g.set('roam');
        return true;
      }
      case 'roam': {
        flock(g, ctx, dt, 4.2 + g.anger * 2.5, 1.6);
        if (g.prankT <= 0) { g.prankT = rnd(8, 15); g.prankTarget = pickProp(g, ctx, 14); if (g.prankTarget) g.set('prank'); }
        else if (g.tauntT <= 0 && ctx.engaged && dP < 10) { g.set('taunt'); g.tauntT = rnd(9, 16); }
        else if (g.swoopCd <= 0 && ctx.engaged && dP < 9) { g.set('windup'); g.swoopCd = rnd(9, 16); }
        return true;
      }
      case 'prank': {
        const p = g.prankTarget;
        if (!p || p.dead || p.broken) { g.set('roam'); return true; }
        propPos(p, _a).y += 0.4;
        g.steer(_a, 8, 3.5, dt);
        if (g.pos.distanceTo(_a) < 0.8) { g.knockProps(1.0, 1.3); g.say('swarm_chitter'); g.mouth = 1; g.vel.y += 3; g.set('roam'); }
        if (g.st > 4) g.set('roam');
        return true;
      }
      case 'taunt': {
        const k = g.t * 3.2 + g.id * 2.1;
        _a.set(target.x + Math.sin(k) * 1.5, target.y + 0.3 + Math.sin(k * 2.3) * 0.25, target.z + Math.cos(k) * 1.5);
        g.steer(_a, 9, 4, dt);
        if (g.st > 2.2) g.set('roam');
        return true;
      }
      case 'windup': {
        g.vel.multiplyScalar(Math.exp(-dt * 6));
        g.mouth = 1;
        if (g.st > 0.35) {
          if (!g.swoopDir) g.swoopDir = V();
          g.swoopDir.copy(target).sub(g.pos).normalize();
          g.slimedMask = 0;
          g.set('swoop'); g.say('ghost_whoosh', 0.7);
        }
        return true;
      }
      case 'swoop': {
        g.vel.copy(g.swoopDir).multiplyScalar(14);
        hitPlayers(g, ctx, 0.8);
        if (g.st > 0.9) { g.vel.multiplyScalar(0.3); g.set('roam'); }
        return true;
      }
      case 'flee': {
        _a.copy(g.pos).sub(target).setY(0).normalize().multiplyScalar(6);
        _a.x += Math.sin(g.t * 5 + g.id) * 3; _a.y += 1 + Math.sin(g.t * 3.3 + g.id) * 1.5; _a.z += Math.cos(g.t * 4.1 + g.id) * 3;
        _a.add(g.pos);
        g.steer(_a, 7.5, 3, dt);
        if (g.lastHit > 1.8) g.set('roam');
        return true;
      }
      default: return false;
    }
  },

  mood(g) { return MOOD[g.state] || 'idle'; },
};
