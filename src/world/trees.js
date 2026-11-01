// Park London plane trees: tapered trunks and limbs plus alpha-tested autumn leaf cards, lit by the analytic lamps.
import { PARK, SIDEWALK_H, rng, GROUP_STATIC } from './layout.js';
import { patchMaterial } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function leafTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const R = rng(77);
  const cols = ['#6b6a22', '#8a7a26', '#5d6b25', '#9a6a1e', '#7d5520', '#4c5a1e', '#a88a2c'];
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2, r = Math.pow(R(), 0.6) * 112;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    g.save();
    g.translate(x, y);
    g.rotate(R() * Math.PI * 2);
    g.fillStyle = cols[(R() * cols.length) | 0];
    g.beginPath();
    const s = 6 + R() * 7;
    g.moveTo(0, -s); g.lineTo(s * 0.8, -s * 0.2); g.lineTo(s * 0.45, s * 0.7); g.lineTo(-s * 0.45, s * 0.7); g.lineTo(-s * 0.8, -s * 0.2); g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function clean(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  return ng;
}

export function buildTrees(ctx) {
  const { THREE: T, root, lamps, world, RAPIER, bodies, quality } = ctx;
  const R = rng(3141);
  const wood = [], leaves = [];
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  bodies.push(fixed);
  const up = new T.Vector3(0, 1, 0);
  const limb = (a, b, r0, r1) => {
    const d = new T.Vector3().subVectors(b, a), L = d.length();
    const g = new T.CylinderGeometry(r1, r0, L, 7, 1, true);
    g.translate(0, L / 2, 0);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up, d.normalize()));
    g.translate(a.x, a.y, a.z);
    wood.push(clean(g));
  };
  const cardsPer = quality === 'low' ? 26 : quality === 'high' ? 50 : 38;
  for (const [x, z] of PARK.trees) {
    const base = new T.Vector3(x, SIDEWALK_H + 0.12, z);
    const h = 3.0 + R() * 0.8;
    const top = base.clone().add(new T.Vector3((R() - 0.5) * 0.4, h, (R() - 0.5) * 0.4));
    limb(base, top, 0.19, 0.13);
    world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.2).setTranslation(x, SIDEWALK_H + h / 2, z).setCollisionGroups(GROUP_STATIC), fixed);
    const crown = top.clone().add(new T.Vector3(0, 2.6, 0));
    const nb = 4 + ((R() * 2) | 0);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + R() * 0.6;
      const end = top.clone().add(new T.Vector3(Math.cos(a) * (1.8 + R()), 2.2 + R() * 1.6, Math.sin(a) * (1.8 + R())));
      limb(top, end, 0.11, 0.05);
      const end2 = end.clone().add(new T.Vector3(Math.cos(a + 0.6) * 1.2, 0.9 + R() * 0.6, Math.sin(a + 0.6) * 1.2));
      limb(end, end2, 0.05, 0.02);
    }
    for (let i = 0; i < cardsPer; i++) {
      const u = R() * Math.PI * 2, v = Math.acos(2 * R() - 1), rr = Math.cbrt(R());
      const off = new T.Vector3(Math.sin(v) * Math.cos(u) * 3.4 * rr, Math.cos(v) * 2.3 * rr, Math.sin(v) * Math.sin(u) * 3.4 * rr);
      const p = crown.clone().add(off);
      const s = 1.35 + R() * 0.75;
      const g = new T.PlaneGeometry(s, s);
      g.applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(R() * Math.PI, R() * Math.PI, R() * Math.PI)));
      g.translate(p.x, p.y, p.z);
      const n = g.attributes.normal;
      const dir = off.clone().normalize();
      for (let k = 0; k < n.count; k++) n.setXYZ(k, dir.x * 0.75, dir.y * 0.75 + 0.25, dir.z * 0.75);
      leaves.push(clean(g));
    }
  }
  const barkMat = patchMaterial(new T.MeshLambertMaterial({ color: 0x4a443c }), {
    lamps, key: 'bark',
    frag: [['color_fragment', 'diffuseColor.rgb *= 0.7 + 0.5 * step( 0.5, fract( sin( dot( floor( vPlateWorld.xz * 7.0 + vPlateWorld.y * 3.0 ), vec2( 12.9, 78.2 ) ) ) * 437.5 ) );']],
  });
  const trunk = new T.Mesh(mergeGeometries(wood), barkMat);
  trunk.castShadow = true;
  trunk.name = 'TreeTrunks';
  root.add(trunk);
  const leafMat = patchMaterial(new T.MeshLambertMaterial({ map: leafTexture(T), alphaTest: 0.5, side: T.DoubleSide }), {
    lamps, key: 'leaf', frag: [['color_fragment', 'diffuseColor.rgb *= 0.9;']],
  });
  const crowns = new T.Mesh(mergeGeometries(leaves), leafMat);
  crowns.castShadow = true;
  crowns.name = 'TreeLeaves';
  root.add(crowns);
  return { trunk, crowns };
}
