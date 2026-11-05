// Skeletal animation texture for instanced pedestrians: half-float bone matrices per frame, sampled with texelFetch and blended across frames and clips per instance.
import { patchMaterial } from '../world/materials.js';

const PARS = /* glsl */`
uniform highp sampler2D uCrowdAnim;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 aAnimA;
attribute vec3 aAnimB;
void crowdBone( float b, float w, inout vec4 R0, inout vec4 R1, inout vec4 R2 ) {
  int x = int( b ) * 3;
  ivec2 p0 = ivec2( x, int( aAnimA.x ) ), p1 = ivec2( x, int( aAnimA.y ) );
  vec4 a0 = mix( texelFetch( uCrowdAnim, p0, 0 ), texelFetch( uCrowdAnim, p1, 0 ), aAnimA.z );
  vec4 a1 = mix( texelFetch( uCrowdAnim, p0 + ivec2( 1, 0 ), 0 ), texelFetch( uCrowdAnim, p1 + ivec2( 1, 0 ), 0 ), aAnimA.z );
  vec4 a2 = mix( texelFetch( uCrowdAnim, p0 + ivec2( 2, 0 ), 0 ), texelFetch( uCrowdAnim, p1 + ivec2( 2, 0 ), 0 ), aAnimA.z );
  if ( aAnimA.w > 0.001 ) {
    ivec2 q0 = ivec2( x, int( aAnimB.x ) ), q1 = ivec2( x, int( aAnimB.y ) );
    a0 = mix( a0, mix( texelFetch( uCrowdAnim, q0, 0 ), texelFetch( uCrowdAnim, q1, 0 ), aAnimB.z ), aAnimA.w );
    a1 = mix( a1, mix( texelFetch( uCrowdAnim, q0 + ivec2( 1, 0 ), 0 ), texelFetch( uCrowdAnim, q1 + ivec2( 1, 0 ), 0 ), aAnimB.z ), aAnimA.w );
    a2 = mix( a2, mix( texelFetch( uCrowdAnim, q0 + ivec2( 2, 0 ), 0 ), texelFetch( uCrowdAnim, q1 + ivec2( 2, 0 ), 0 ), aAnimB.z ), aAnimA.w );
  }
  R0 += a0 * w; R1 += a1 * w; R2 += a2 * w;
}
`;

const BASE = /* glsl */`
vec4 cR0 = vec4( 0.0 ), cR1 = vec4( 0.0 ), cR2 = vec4( 0.0 );
crowdBone( skinIndex.x, skinWeight.x, cR0, cR1, cR2 );
if ( skinWeight.y > 0.0 ) crowdBone( skinIndex.y, skinWeight.y, cR0, cR1, cR2 );
if ( skinWeight.z > 0.0 ) crowdBone( skinIndex.z, skinWeight.z, cR0, cR1, cR2 );
if ( skinWeight.w > 0.0 ) crowdBone( skinIndex.w, skinWeight.w, cR0, cR1, cR2 );
`;
const NORMAL = 'objectNormal = vec3( dot( cR0.xyz, objectNormal ), dot( cR1.xyz, objectNormal ), dot( cR2.xyz, objectNormal ) );';
const SKIN = 'transformed = vec3( dot( cR0, vec4( transformed, 1.0 ) ), dot( cR1, vec4( transformed, 1.0 ) ), dot( cR2, vec4( transformed, 1.0 ) ) );';

export function animTexture(THREE, meta, buffer) {
  const tex = new THREE.DataTexture(new Uint16Array(buffer), meta.width, meta.height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function crowdMaterial(THREE, { map, animTex, lamps = null, envMapIntensity = 0.45 }) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, envMapIntensity });
  m.name = 'CrowdPed';
  return patchMaterial(m, {
    lamps,
    uniforms: { uCrowdAnim: { value: animTex } },
    vertexPars: PARS,
    vert: [['skinbase_vertex', BASE, 'replace'], ['skinnormal_vertex', NORMAL, 'replace'], ['skinning_vertex', SKIN, 'replace']],
  });
}

export function crowdDepthMaterial(THREE, animTex) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.name = 'CrowdPedDepth';
  return patchMaterial(m, {
    uniforms: { uCrowdAnim: { value: animTex } },
    vertexPars: PARS,
    vert: [['skinbase_vertex', BASE, 'replace'], ['skinning_vertex', SKIN, 'replace']],
  });
}

export function crowdGeometry(THREE, mesh, meta, cap) {
  const g = mesh.geometry.clone();
  g.applyMatrix4(mesh.bindMatrix);
  const col = new Map(meta.bones.map((n, i) => [n, i]));
  const names = mesh.skeleton.bones.map((b) => b.name);
  const head = col.get('Head') || 0;
  const remap = names.map((n) => (col.has(n) ? col.get(n) : head));
  const si = g.attributes.skinIndex, n = si.count;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = remap[si.getComponent(i, k)] || 0;
  g.setAttribute('skinIndex', new THREE.BufferAttribute(out, 4));
  const sw = g.attributes.skinWeight;
  if (sw.normalized || !(sw.array instanceof Float32Array)) {
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) w[i * 4 + k] = sw.getComponent(i, k);
    g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  }
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  a.setUsage(THREE.DynamicDrawUsage); b.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aAnimA', a); g.setAttribute('aAnimB', b);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
  return g;
}
