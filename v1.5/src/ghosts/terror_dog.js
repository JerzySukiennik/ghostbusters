// Terror dog behaviour: a ground-bound demon hound that guards and gnaws at its spawn, prowls the route, smashes props, stalks the crew in a snarling circle, crouches and pounces in a ballistic leap.
import { V, rnd, clamp, nearestPlayer, pickProp, propPos, routePoint, advanceRoute, drive, stickToGround, groundAt, hitPlayers, MOOD } from './common.js';

const _a = V(), _b = V(), _t = V(), _d = V();
const FLOOR = 0.95;
const GRAV = 18;

export default {
  type: 'terror_dog',
  name: 'Terror Dog',
  cls: 7,
  clsName: 'Class VII Metaphysical Entity',
  radius: 0.85,
  will: 140,
  speed: 7,
  bounty: 2200,
  prefers: ['outdoor', 'park', 'plaza'],
  floor: FLOOR,
  ground: true,
  voice: { ghost_laugh: 'dog_snarl', ghost_roar: 'dog_howl', ghost_wail: 'dog_howl', ghost_whoosh: 'dog_snarl', ghost_eat: 'dog_snarl' },

  init(g) {
    g.fxx = { air: 0 };
    g.slimedMask = 0;
    g.air = false;
    g.heading = undefined;
    g.snarlT = rnd(2, 5);
    g.tgt = V();
  },

  step(g, dt, ctx) {
    const target = nearestPlayer(g, ctx, _t);
    const dP = _d.copy(target).sub(g.pos).setY(0).length();
    g.tgt.copy(target);
    g.snarlT -= dt;
    if (g.air && g.state !== 'swoop' && g.state !== 'flee') g.air = false;
    g.fxx.air = g.air ? 1 : 0;
    switch (g.state) {
      case 'eat': {
        _a.copy(g.cart);
        _a.x += Math.sin(g.t * 0.5) * 1.6; _a.z += Math.cos(g.t * 0.4) * 1.6;
        drive(g, dt, _a.x, _a.z, g.st % 6 < 3.5 ? 0.0 : 1.4, 2.5, 2);
        stickToGround(g, ctx, FLOOR, dt);
        if (g.snarlT <= 0) { g.snarlT = rnd(2.5, 5); g.mouth = 1; g.say('dog_snarl', 0.7); }
        if (ctx.engaged && (dP < 16 || g.st > 12)) { g.say('dog_howl', 1.1); g.set('roam'); }
        return true;
      }
      case 'roam': {
        const w = routePoint(g);
        drive(g, dt, w.x, w.z, 3.6 + g.anger * 4.5, 3.2, 3);
        advanceRoute(g, 2);
        stickToGround(g, ctx, FLOOR, dt);
        if (g.snarlT <= 0) { g.snarlT = rnd(3, 6); g.say('dog_snarl', 0.8); g.mouth = 1; }
        if (g.prankT <= 0) { g.prankT = rnd(7, 11); g.prankTarget = pickProp(g, ctx, 25); if (g.prankTarget) g.set('prank'); }
        else if (g.tauntT <= 0 && ctx.engaged && dP < 16) { g.set('taunt'); g.tauntT = rnd(9, 14); g.orbit = Math.atan2(g.pos.x - target.x, g.pos.z - target.z); }
        else if (g.swoopCd <= 0 && ctx.engaged && dP < 12 && dP > 3.5) { g.set('windup'); g.swoopCd = rnd(8, 12); g.say('dog_snarl', 1.2); }
        return true;
      }
      case 'prank': {
        const p = g.prankTarget;
        if (!p || p.dead || p.broken) { g.set('roam'); return true; }
        propPos(p, _a);
        drive(g, dt, _a.x, _a.z, 9.5, 4.5, 4);
        stickToGround(g, ctx, FLOOR, dt);
        _a.y = g.pos.y;
        if (g.pos.distanceTo(_a) < 1.7) { g.knockProps(1.8, 2.2); g.mouth = 1; g.say('dog_snarl', 1.1); g.set('roam'); }
        if (g.st > 5) g.set('roam');
        return true;
      }
      case 'taunt': {
        g.orbit = (g.orbit || 0) + dt * 0.55;
        const R = 6.5;
        _a.set(target.x + Math.sin(g.orbit) * R, 0, target.z + Math.cos(g.orbit) * R);
        drive(g, dt, _a.x, _a.z, 2.6, 3, 3);
        stickToGround(g, ctx, FLOOR, dt);
        if (g.st > 0.4 && g.snarlT <= 0) { g.snarlT = rnd(0.9, 1.6); g.say('dog_snarl', 1); g.mouth = 1; }
        if (g.st > 3.2) g.set('roam');
        return true;
      }
      case 'windup': {
        g.vel.x *= Math.exp(-dt * 8); g.vel.z *= Math.exp(-dt * 8);
        g.heading = Math.atan2(target.x - g.pos.x, target.z - g.pos.z);
        stickToGround(g, ctx, FLOOR, dt);
        g.mouth = 1;
        if (g.st > 0.6) {
          if (!g.swoopDir) g.swoopDir = V();
          g.swoopDir.copy(target).sub(g.pos).setY(0);
          const d = g.swoopDir.length();
          g.swoopDir.multiplyScalar(1 / Math.max(d, 0.01));
          const T = clamp(d / 12, 0.5, 0.85);
          g.vel.set(g.swoopDir.x * d / T, 0.5 * GRAV * T, g.swoopDir.z * d / T);
          g.air = true; g.slimedMask = 0;
          g.set('swoop'); g.say('dog_snarl', 1.3);
        }
        return true;
      }
      case 'swoop': {
        if (g.air) {
          g.vel.y -= GRAV * dt;
          hitPlayers(g, ctx, 1.4);
          const gy = groundAt(ctx, g.pos.x, g.pos.z) + FLOOR;
          if (g.pos.y + g.vel.y * dt <= gy && g.vel.y < 0) { g.air = false; g.pos.y = gy; g.vel.y = 0; g.vel.x *= 0.5; g.vel.z *= 0.5; g.knockProps(1.6, 1.8); }
        } else {
          g.vel.x *= Math.exp(-dt * 4); g.vel.z *= Math.exp(-dt * 4);
          stickToGround(g, ctx, FLOOR, dt);
          if (g.st > 0.5) g.set('roam');
        }
        if (g.st > 2) { g.air = false; g.set('roam'); }
        return true;
      }
      case 'flee': {
        _a.copy(g.pos).sub(target).setY(0).normalize().multiplyScalar(12).add(g.pos);
        _a.x += Math.sin(g.t * 2.3) * 5;
        _a.z += Math.cos(g.t * 1.9) * 5;
        drive(g, dt, _a.x, _a.z, 9 - (1 - g.will / (g.maxWill || 140)) * 3, 5, 4);
        stickToGround(g, ctx, FLOOR, dt);
        if (g.lastHit > 2.2) g.set(g.anger > 0.3 && g.swoopCd <= 0 && dP < 12 ? 'windup' : 'roam');
        return true;
      }
      default: return false;
    }
  },

  face(g, out) {
    if (g.state === 'taunt' || g.state === 'windup') { out.set(g.tgt.x - g.pos.x, 0, g.tgt.z - g.pos.z).normalize(); return true; }
    if (g.heading !== undefined && g.state !== 'wrangled' && g.state !== 'sucked' && g.state !== 'stagger') { out.set(Math.sin(g.heading), 0, Math.cos(g.heading)); return true; }
    return false;
  },

  mood(g) {
    if (g.state === 'eat') return 'eat';
    if (g.state === 'roam') return g.anger > 0.5 ? 'angry' : 'idle';
    if (g.state === 'prank') return 'angry';
    return MOOD[g.state] || 'idle';
  },
};
