// Taxi ghost behaviour: the rotting cabbie drives his spectral cab along the streets, rams props, honks, gets out of the cab to cackle at the crew, revs and charges them, speeds away when hurt.
import { V, rnd, clamp, nearestPlayer, pickProp, propPos, routePoint, advanceRoute, drive, stickToGround, hitPlayers, MOOD } from './common.js';

const _a = V(), _t = V(), _d = V();
const FLOOR = 0.95;
const CAB = { eat: 1, roam: 1, prank: 1, windup: 1, swoop: 1, flee: 1 };

export default {
  type: 'taxi',
  name: 'Taxi Ghost',
  cls: 3,
  clsName: 'Class III Full-Torso Mobile Apparition',
  radius: 0.62,
  will: 110,
  speed: 9,
  bounty: 1200,
  prefers: ['outdoor', 'street', 'avenue'],
  floor: FLOOR,
  ground: false,
  voice: { ghost_laugh: 'taxi_cackle', ghost_roar: 'traffic_horn', ghost_whoosh: 'traffic_horn' },

  init(g) {
    g.fxx = { cab: 1 };
    g.slimedMask = 0;
    g.honkT = rnd(3, 6);
    g.heading = undefined;
    g.tgt = V();
  },

  step(g, dt, ctx) {
    const target = nearestPlayer(g, ctx, _t);
    const dP = _d.copy(target).sub(g.pos).length();
    g.tgt.copy(target);
    const inCab = CAB[g.state] === 1;
    g.fxx.cab = inCab ? 1 : 0;
    g.honkT -= dt;
    switch (g.state) {
      case 'eat': {
        g.vel.multiplyScalar(Math.exp(-dt * 3));
        stickToGround(g, ctx, FLOOR, dt);
        if (ctx.engaged && (dP < 14 || g.st > 10)) { g.say('traffic_horn'); g.set('roam'); }
        return true;
      }
      case 'roam': {
        const w = routePoint(g);
        drive(g, dt, w.x, w.z, 8.5 + g.anger * 3, 1.6, 1.6);
        advanceRoute(g, 3);
        stickToGround(g, ctx, FLOOR, dt);
        if (g.honkT <= 0) { g.honkT = rnd(4, 8); g.say(Math.random() < 0.6 ? 'traffic_horn' : 'taxi_cackle', 0.9); }
        if (g.prankT <= 0) { g.prankT = rnd(8, 13); g.prankTarget = pickProp(g, ctx, 30); if (g.prankTarget) g.set('prank'); }
        else if (g.tauntT <= 0 && ctx.engaged && dP < 18) { g.set('taunt'); g.tauntT = rnd(11, 16); }
        else if (g.swoopCd <= 0 && ctx.engaged && dP < 22 && dP > 6) { g.set('windup'); g.swoopCd = rnd(10, 15); g.say('traffic_horn', 1.1); }
        return true;
      }
      case 'prank': {
        const p = g.prankTarget;
        if (!p || p.dead || p.broken) { g.set('roam'); return true; }
        propPos(p, _a);
        drive(g, dt, _a.x, _a.z, 12, 2.2, 2.2);
        stickToGround(g, ctx, FLOOR, dt);
        _a.y = g.pos.y;
        if (g.pos.distanceTo(_a) < 2.2) { g.knockProps(2.2, 2.5); g.say('taxi_cackle'); g.mouth = 1; g.set('roam'); }
        if (g.st > 6) g.set('roam');
        return true;
      }
      case 'taunt': {
        g.vel.x *= Math.exp(-dt * 3); g.vel.z *= Math.exp(-dt * 3);
        const rise = clamp(g.st / 0.8, 0, 1);
        _a.copy(g.pos);
        _a.y = target.y + 0.2 * rise;
        g.vel.y += (_a.y - g.pos.y) * dt * 6 - g.vel.y * dt * 3;
        if (g.st > 0.5 && g.st - dt <= 0.5) { g.say('taxi_cackle', 1.1); g.mouth = 1; }
        if (g.st > 1.6 && g.st - dt <= 1.6) { g.say('taxi_cackle', 1.0); g.mouth = 1; }
        if (g.st > 2.8) g.set('roam');
        return true;
      }
      case 'windup': {
        _a.copy(target).sub(g.pos);
        drive(g, dt, target.x, target.z, -2.5, 3.5, 3);
        stickToGround(g, ctx, FLOOR, dt);
        g.mouth = 1;
        if (g.st > 0.9) {
          if (!g.swoopDir) g.swoopDir = V();
          g.swoopDir.copy(target).sub(g.pos).setY(0).normalize();
          g.heading = Math.atan2(g.swoopDir.x, g.swoopDir.z);
          g.slimedMask = 0;
          g.set('swoop'); g.say('traffic_horn', 1.3);
        }
        return true;
      }
      case 'swoop': {
        const s = 17 * clamp(g.st * 3, 0.3, 1);
        g.vel.set(g.swoopDir.x * s, 0, g.swoopDir.z * s);
        stickToGround(g, ctx, FLOOR, dt);
        hitPlayers(g, ctx, 2.0);
        g.knockProps(1.8, 2.2);
        if (g.st > 1.5) { g.vel.multiplyScalar(0.4); g.set('roam'); }
        return true;
      }
      case 'flee': {
        _a.copy(g.pos).sub(target).setY(0).normalize().multiplyScalar(14).add(g.pos);
        _a.x += Math.sin(g.t * 1.7) * 4;
        drive(g, dt, _a.x, _a.z, 11 - (1 - g.will / (g.maxWill || 110)) * 3, 2.4, 2.5);
        stickToGround(g, ctx, FLOOR, dt);
        if (g.lastHit > 2.4) g.set('roam');
        return true;
      }
      default: return false;
    }
  },

  face(g, out) {
    if (g.state === 'taunt') { out.copy(g.tgt).sub(g.pos).setY(0).normalize(); return true; }
    if (g.heading !== undefined && g.fxx.cab > 0.5) { out.set(Math.sin(g.heading), 0, Math.cos(g.heading)); return true; }
    return false;
  },

  mood(g) {
    if (g.state === 'eat' || g.state === 'roam') return 'idle';
    if (g.state === 'prank') return 'angry';
    return MOOD[g.state] || 'idle';
  },
};
