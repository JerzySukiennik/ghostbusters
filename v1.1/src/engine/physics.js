// Rapier world, collision groups and ray helpers shared by every system.
import RAPIER from 'rapier';
import * as THREE from 'three';

export const G = { STATIC: 0x0001, PROP: 0x0002, PLAYER: 0x0004, VEHICLE: 0x0008, DEBRIS: 0x0010, GHOST: 0x0020, TRAP: 0x0040, SENSOR: 0x0080 };
export const groups = (member, filter = 0xffff) => ((member << 16) | filter) >>> 0;
export const G_STATIC = G.STATIC, G_PROP = G.PROP, G_PLAYER = G.PLAYER, G_VEHICLE = G.VEHICLE, G_DEBRIS = G.DEBRIS, G_GHOST = G.GHOST, G_TRAP = G.TRAP, G_SENSOR = G.SENSOR;
export const interactionGroups = groups;

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.step = 1 / 60;
    this.acc = 0;
    this.owners = new Map();
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0, collider: null, owner: null };
    this.fixed = [];
  }

  own(collider, owner) { if (collider) this.owners.set(collider.handle, owner); }
  ownerOf(collider) { return collider ? this.owners.get(collider.handle) || null : null; }

  update(dt, pre, post) {
    this.acc = Math.min(this.acc + dt, this.step * 4);
    let n = 0;
    while (this.acc >= this.step) {
      if (pre) pre(this.step);
      this.world.step();
      if (post) post(this.step);
      this.acc -= this.step;
      n++;
    }
    return n;
  }

  cast(origin, dir, maxDist, filter = 0xffff, excludeCollider = null, excludeBody = null) {
    this.ray.origin.x = origin.x; this.ray.origin.y = origin.y; this.ray.origin.z = origin.z;
    this.ray.dir.x = dir.x; this.ray.dir.y = dir.y; this.ray.dir.z = dir.z;
    const h = this.world.castRayAndGetNormal(this.ray, maxDist, true, undefined, groups(0xffff, filter), excludeCollider || undefined, excludeBody || undefined);
    if (!h) return null;
    const t = h.timeOfImpact ?? h.toi;
    const o = this.hit;
    o.dist = t;
    o.point.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    o.normal.set(h.normal.x, h.normal.y, h.normal.z);
    o.collider = h.collider;
    o.owner = this.ownerOf(h.collider);
    return o;
  }

  addStaticBox(cx, cy, cz, hx, hy, hz, rotY = 0) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) }));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(groups(G.STATIC)), body);
    return { body, col };
  }

  explode(center, radius, impulse, filter = G.PROP | G.DEBRIS | G.VEHICLE) {
    const out = [];
    this.world.forEachRigidBody((b) => {
      if (!b.isDynamic()) return;
      const p = b.translation();
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius || d < 1e-4) return;
      let ok = false;
      for (let i = 0, n = b.numColliders(); i < n; i++) { const g = b.collider(i).collisionGroups() >>> 16; if (g & filter) ok = true; }
      if (!ok) return;
      const k = impulse * (1 - d / radius) * Math.min(1, b.mass() / 4 + 0.25);
      b.applyImpulse({ x: dx / d * k, y: Math.abs(dy / d) * k * 0.6 + k * 0.35, z: dz / d * k }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * k * 0.2, y: (Math.random() - 0.5) * k * 0.2, z: (Math.random() - 0.5) * k * 0.2 }, true);
      out.push(b);
    });
    return out;
  }
}
