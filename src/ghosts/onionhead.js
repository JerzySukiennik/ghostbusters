// Onionhead behaviour: gorges at the food, roams the route, pranks props, taunts close to the crew, winds up and swoops to slime a player.
import { V, rnd, nearestPlayer, pickProp, propPos, followRoute, hitPlayers, MOOD } from './common.js';

const _a = V(), _b = V(), _t = V(), _d = V();

export default {
  type: 'onionhead',
  name: 'Onionhead',
  cls: 5,
  clsName: 'Class V Full Roaming Vapor',
  radius: 0.58,
  will: 100,
  speed: 3.6,
  bounty: 1000,
  prefers: ['outdoor', 'indoor', 'food'],
  floor: null,
  ground: false,
  voice: {},

  init(g) {
    g.fxx = null;
    g.slimedMask = 0;
  },

  step(g, dt, ctx) {
    const target = nearestPlayer(g, ctx, _t);
    const dP = _d.copy(target).sub(g.pos).length();
    switch (g.state) {
      case 'eat': {
        _a.copy(g.cart).add(_b.set(Math.sin(g.t * 0.8) * 0.4, 1.0 + Math.sin(g.t * 1.7) * 0.15, Math.cos(g.t * 0.6) * 0.3));
        g.steer(_a, 2, 3, dt);
        g.eatT -= dt;
        if (g.eatT <= 0) {
          g.eatT = rnd(1.1, 2.0); g.mouth = 1; g.say('ghost_eat', 0.9);
          const F = g.food || [];
          for (let i = 0; i < F.length; i++) {
            const f = F[i];
            if (f.dead || f.broken || f.eaten || !f.object3D) continue;
            f.eaten = true; f.dead = true; f.object3D.visible = false;
            try { if (f.body) f.body.setEnabled(false); } catch (e) { }
            if (g.onEat) g.onEat(f);
            break;
          }
        }
        if (ctx.engaged && (dP < 10 || g.st > 14)) { g.say('ghost_laugh'); g.set('roam'); }
        return true;
      }
      case 'roam': {
        followRoute(g, dt, 3.6 + g.anger * 2, 1.6);
        if (g.prankT <= 0) { g.prankT = rnd(7, 12); g.prankTarget = pickProp(g, ctx, 40); g.set('prank'); }
        else if (g.tauntT <= 0 && ctx.engaged) { g.set('taunt'); g.tauntT = rnd(9, 15); }
        else if (g.swoopCd <= 0 && ctx.engaged && dP < 16 && g.anger > 0.25) { g.set('windup'); g.swoopCd = rnd(11, 16); g.say('ghost_roar'); }
        if (g.state === 'roam' && g.st > 1.2 && Math.random() < dt * 0.15) g.say('ghost_laugh', 0.7);
        return true;
      }
      case 'prank': {
        const p = g.prankTarget;
        if (!p || p.dead || p.broken) { g.set('roam'); return true; }
        propPos(p, _a).y += 0.6;
        g.steer(_a, 7, 3, dt);
        if (g.pos.distanceTo(_a) < 1.3) { g.knockProps(1.6, 2); g.mouth = 1; g.say('ghost_laugh'); g.vel.y += 4; g.set('roam'); }
        if (g.st > 5) g.set('roam');
        return true;
      }
      case 'taunt': {
        _b.copy(target).sub(g.pos).normalize();
        _a.copy(target).add(_d.set(Math.sin(g.t * 2) * 2.5, 1.2 + Math.sin(g.t * 3) * 0.5, 0)).addScaledVector(_b, -4.5);
        g.steer(_a, 6, 3, dt);
        if (g.st > 0.6 && g.st - dt <= 0.6) { g.say('ghost_laugh', 1.1); g.mouth = 1; }
        if (g.st > 2.4) g.set('roam');
        return true;
      }
      case 'windup': {
        _b.copy(target).sub(g.pos).normalize();
        _a.copy(g.pos).addScaledVector(_b, -0.6);
        _a.y = Math.max(g.pos.y, target.y + 1.5);
        g.steer(_a, 2.5, 4, dt);
        g.mouth = 1; g.hurt = Math.max(g.hurt, 0.3);
        if (g.st > 0.65) {
          if (!g.swoopDir) g.swoopDir = V();
          g.swoopDir.copy(target).sub(g.pos).normalize();
          g.slimedMask = 0;
          g.set('swoop'); g.say('ghost_whoosh', 1.2);
        }
        return true;
      }
      case 'swoop': {
        g.vel.copy(g.swoopDir).multiplyScalar(15);
        hitPlayers(g, ctx, 1.25);
        g.knockProps(0.8, 1.2);
        if (g.st > 1.3) { g.vel.multiplyScalar(0.3); g.set('roam'); }
        return true;
      }
      default: return false;
    }
  },

  mood(g) { return MOOD[g.state] || 'idle'; },
};
