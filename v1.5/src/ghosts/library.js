// Library ghost behaviour: reads in mid-air, drifts the stacks, shushes the crew; provoked she turns into the skull-faced horror, screams, flings books and lunges.
import { V, rnd, clamp, nearestPlayer, pickProp, propPos, followRoute, hitPlayers, MOOD } from './common.js';

const _a = V(), _b = V(), _t = V(), _d = V();

export default {
  type: 'library',
  name: 'Library Ghost',
  cls: 4,
  clsName: 'Class IV Free-Floating Full-Torso Repeating Phantasm',
  radius: 0.72,
  will: 120,
  speed: 2.6,
  bounty: 1400,
  prefers: ['indoor', 'library', 'steps'],
  floor: null,
  ground: false,
  voice: { ghost_laugh: 'library_shush', ghost_roar: 'library_scream', ghost_wail: 'library_scream', ghost_whoosh: 'library_scream' },

  init(g) {
    g.fxx = { fling: 0, at: V() };
    g.slimedMask = 0;
    g.books = 0;
    g.bookT = 0;
    g.horror = 0;
  },

  step(g, dt, ctx) {
    const target = nearestPlayer(g, ctx, _t);
    const dP = _d.copy(target).sub(g.pos).length();
    if (dP < 2.6 && g.state !== 'wrangled' && g.state !== 'sucked') g.anger = Math.min(1, g.anger + dt * 0.25);
    g.horror = g.anger > 0.35 || g.state === 'windup' || g.state === 'swoop' || g.state === 'prank' ? 1 : Math.max(0, g.horror - dt * 0.2);
    g.fxx.at.copy(target);
    switch (g.state) {
      case 'eat': {
        _a.copy(g.cart).add(_b.set(Math.sin(g.t * 0.3) * 0.3, 1.6 + Math.sin(g.t * 0.9) * 0.08, Math.cos(g.t * 0.25) * 0.3));
        g.steer(_a, 0.8, 2, dt);
        if (ctx.engaged && dP < 9) { g.set('taunt'); g.tauntT = rnd(10, 15); }
        else if (ctx.engaged && g.st > 18) g.set('roam');
        return true;
      }
      case 'roam': {
        followRoute(g, dt, 1.6 + g.anger * 3.2, 1.2);
        if (g.anger > 0.35 && g.swoopCd <= 0 && ctx.engaged && dP < 14) { g.set('windup'); g.swoopCd = rnd(9, 14); g.say('library_scream'); }
        else if (g.prankT <= 0 && ctx.engaged && dP < 16 && g.anger > 0.15) { g.prankT = rnd(8, 12); g.books = (5 + Math.random() * 3) | 0; g.bookT = 0.5; g.set('prank'); g.say('library_scream', 0.8); g.knockProps(3.2, 1.3); }
        else if (g.prankT <= 0) { g.prankT = rnd(8, 12); g.prankTarget = pickProp(g, ctx, 25); if (g.prankTarget) g.set('prank'); }
        else if (g.tauntT <= 0 && ctx.engaged && dP < 12) { g.set('taunt'); g.tauntT = rnd(10, 16); }
        return true;
      }
      case 'prank': {
        if (g.books > 0) {
          _b.copy(target).sub(g.pos).setY(0).normalize();
          _a.copy(target).addScaledVector(_b, -6).setY(target.y + 1.4);
          g.steer(_a, 2.2, 2.5, dt);
          g.bookT -= dt;
          if (g.bookT <= 0) { g.bookT = rnd(0.32, 0.55); g.books--; g.fxx.fling++; g.mouth = 1; if (ctx.onBook) ctx.onBook(g, target); }
          if (g.books <= 0 || g.st > 6) g.set('roam');
          return true;
        }
        const p = g.prankTarget;
        if (!p || p.dead || p.broken) { g.set('roam'); return true; }
        propPos(p, _a).y += 1.0;
        g.steer(_a, 4, 2.5, dt);
        if (g.pos.distanceTo(_a) < 1.6) { g.knockProps(2.2, 1.6); g.fxx.fling += 2; g.set('roam'); }
        if (g.st > 6) g.set('roam');
        return true;
      }
      case 'taunt': {
        _b.copy(target).sub(g.pos).setY(0).normalize();
        _a.copy(target).addScaledVector(_b, -3.4).setY(target.y + 0.5 + Math.sin(g.t * 1.4) * 0.15);
        g.steer(_a, 2.5, 2.5, dt);
        if (g.st > 0.4 && g.st - dt <= 0.4) { g.say('library_shush', 1.1); g.mouth = 0.4; }
        if (g.st > 2.6) { g.set('roam'); if (dP < 4) g.anger = Math.min(1, g.anger + 0.2); }
        return true;
      }
      case 'windup': {
        _b.copy(target).sub(g.pos).normalize();
        _a.copy(g.pos).addScaledVector(_b, -0.4);
        _a.y = Math.max(g.pos.y, target.y + 0.9);
        g.steer(_a, 1.5, 4, dt);
        g.mouth = 1; g.hurt = Math.max(g.hurt, 0.35);
        if (g.st > 0.9) {
          if (!g.swoopDir) g.swoopDir = V();
          g.swoopDir.copy(target).sub(g.pos).normalize();
          g.slimedMask = 0;
          g.set('swoop'); g.say('library_scream', 1.2);
        }
        return true;
      }
      case 'swoop': {
        g.vel.copy(g.swoopDir).multiplyScalar(12.5 * clamp(1.3 - g.st * 0.4, 0.4, 1));
        g.mouth = 1;
        hitPlayers(g, ctx, 1.35);
        g.knockProps(1.0, 1.4);
        if (g.st > 1.2) { g.vel.multiplyScalar(0.25); g.prankT = Math.min(g.prankT, 2); g.set('roam'); }
        return true;
      }
      default: return false;
    }
  },

  hit(g) { g.anger = Math.min(1, g.anger + 0.15); },

  mood(g) {
    if (g.state === 'roam') return g.horror > 0.5 ? 'angry' : 'idle';
    if (g.state === 'prank') return 'angry';
    return MOOD[g.state] || 'idle';
  },
};
