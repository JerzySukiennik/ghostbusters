// Janine at her Firehouse desk: loads assets/people/janine.glb onto the JanineSeat empty and plays her desk clips with crossfades, auto-chaining the one-shots.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/people/';
const LOOPS = new Set(['desk_idle', 'type', 'phone_talk']);

export async function createJanine({ THREE, scene, seat = null, base = BASE, shadows = true }) {
  const [meta, gltf] = await Promise.all([
    fetch(base + 'janine.json').then((r) => r.json()),
    new GLTFLoader().loadAsync(base + 'janine.glb'),
  ]);
  const root = gltf.scene;
  root.name = 'JanineRoot';
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadows && o.name !== 'JanineLens';
    o.receiveShadow = true;
    o.frustumCulled = false;
    const m = o.material;
    if (o.name === 'JanineLens') { m.transparent = true; m.depthWrite = false; m.envMapIntensity = 1.4; o.renderOrder = 2; }
    else if (m) m.envMapIntensity = 0.6;
  });
  const P = new THREE.Vector3(), Q = new THREE.Quaternion();
  function place(s) {
    if (!s) return;
    if (s.isObject3D) { s.updateWorldMatrix(true, false); s.getWorldPosition(P); s.getWorldQuaternion(Q); root.position.copy(P); root.quaternion.copy(Q); }
    else { root.position.set(s.pos.x ?? s.pos[0], s.pos.y ?? s.pos[1], s.pos.z ?? s.pos[2]); root.rotation.set(0, s.yaw || 0, 0); }
    root.updateMatrixWorld(true);
  }
  place(seat);
  scene.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const acts = new Map();
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (LOOPS.has(clip.name)) a.setLoop(THREE.LoopRepeat, Infinity);
    else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    acts.set(clip.name, a);
  }
  let cur = null, after = null, rest = 'desk_idle';

  function play(name, fade = 0.35, opts = {}) {
    const a = acts.get(name);
    if (!a) return false;
    const reverse = !!opts.reverse;
    if (a === cur && LOOPS.has(name)) return true;
    a.reset();
    a.setEffectiveWeight(1); a.setEffectiveTimeScale(reverse ? -1 : 1);
    if (reverse) a.time = a.getClip().duration;
    a.play();
    if (cur && cur !== a) cur.crossFadeTo(a, fade, false);
    cur = a;
    after = opts.then || (name === 'phone_answer' && !reverse ? 'phone_talk' : LOOPS.has(name) ? null : rest);
    if (LOOPS.has(name) && name !== 'phone_talk') rest = name;
    return true;
  }

  mixer.addEventListener('finished', (e) => { if (e.action === cur && after) { const n = after; after = null; play(n, n === 'phone_talk' ? 0.12 : 0.4); } });
  play('desk_idle', 0);

  return {
    root, meta, clips: [...acts.keys()],
    get state() { return cur ? cur.getClip().name : null; },
    play,
    answer() { return play('phone_answer', 0.3); },
    hangUp() { return play('phone_answer', 0.15, { reverse: true, then: rest }); },
    callOut() { return play('call_out', 0.25, { then: rest }); },
    type(on = true) { rest = on ? 'type' : 'desk_idle'; return play(rest, 0.5); },
    place,
    update(dt) { mixer.update(dt); },
    dispose() {
      mixer.stopAllAction();
      scene.remove(root);
      root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const m = o.material; if (m) { if (m.map) m.map.dispose(); m.dispose(); } } });
    },
  };
}
