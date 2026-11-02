// Con Ed manhole steam (lit by the lamps and by any point light such as the proton stream) and the burst-hydrant water jet.
import { MANHOLES } from './layout.js';
import { LAMP_SLOTS } from './materials.js';

const STEAM_VS = /* glsl */`
  attribute vec4 aP; attribute vec4 aA;
  varying vec2 vUv; varying vec4 vA; varying vec3 vW; varying float vFog;
  uniform float uFogDensity;
  void main() {
    vec4 mv = viewMatrix * vec4( aP.xyz, 1.0 );
    float c = cos( aA.y ), s = sin( aA.y );
    vec2 p = mat2( c, -s, s, c ) * position.xy * aP.w;
    mv.xy += p;
    vUv = uv; vA = aA; vW = aP.xyz;
    vFog = exp( -uFogDensity * uFogDensity * mv.z * mv.z );
    gl_Position = projectionMatrix * mv;
  }`;

const STEAM_FS = /* glsl */`
  #include <common>
  #include <lights_pars_begin>
  uniform sampler2D uTex;
  uniform vec4 uLampPos[${LAMP_SLOTS}];
  uniform vec4 uLampDir[${LAMP_SLOTS}];
  uniform vec4 uLampCol[${LAMP_SLOTS}];
  uniform vec4 uLampFill[${LAMP_SLOTS}];
  uniform int uLampCount;
  uniform vec3 uAmbient, uFogColor;
  varying vec2 vUv; varying vec4 vA; varying vec3 vW; varying float vFog;
  void main() {
    float a = texture2D( uTex, vUv ).a * vA.z;
    if ( a < 0.004 ) discard;
    vec3 L = uAmbient;
    for ( int i = 0; i < ${LAMP_SLOTS}; i ++ ) {
      if ( i >= uLampCount ) break;
      vec4 lp = uLampPos[ i ];
      vec3 d = lp.xyz - vW;
      float dist = length( d );
      if ( dist > lp.w ) continue;
      float att = getDistanceAttenuation( dist, lp.w, 2.0 );
      float sp = getSpotAttenuation( uLampDir[ i ].w, uLampCol[ i ].a, dot( d / dist, uLampDir[ i ].xyz ) );
      L += ( uLampCol[ i ].rgb + uLampFill[ i ].rgb * 8.0 ) * att * ( 0.25 + sp ) * 0.12;
    }
    #if NUM_POINT_LIGHTS > 0
    for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
      vec3 d = pointLights[ i ].position - ( viewMatrix * vec4( vW, 1.0 ) ).xyz;
      float dist = length( d );
      L += pointLights[ i ].color * getDistanceAttenuation( dist, pointLights[ i ].distance, pointLights[ i ].decay ) * 0.35;
    }
    #endif
    vec3 col = L * ( 0.65 + 0.35 * vA.w );
    col = mix( uFogColor, col, vFog );
    gl_FragColor = vec4( col * a, a * vFog );
  }`;

export function buildSteam(ctx) {
  const { THREE: T, root, lamps, tx } = ctx;
  const emitters = [];
  for (const m of MANHOLES) if (m.steam > 0) emitters.push({ x: m.pos[0], y: 0.05, z: m.pos[1], rate: m.steam, base: [m.pos[0], 0.05, m.pos[1]] });
  const N = Math.round(emitters.length * 30 * (ctx.quality === 'low' ? 0.6 : 1));
  const geo = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const aP = new Float32Array(N * 4), aA = new Float32Array(N * 4);
  const iP = new T.InstancedBufferAttribute(aP, 4).setUsage(T.DynamicDrawUsage);
  const iA = new T.InstancedBufferAttribute(aA, 4).setUsage(T.DynamicDrawUsage);
  geo.setAttribute('aP', iP);
  geo.setAttribute('aA', iA);
  geo.instanceCount = N;
  const uniforms = T.UniformsUtils.merge([T.UniformsLib.lights, {
    uTex: { value: tx.tex('tex/steam.png', { wrap: false }) },
    uLampCount: { value: lamps.count },
    uAmbient: { value: new T.Color(0.006, 0.0075, 0.01) },
    uFogColor: { value: new T.Color(0.0095, 0.0122, 0.018) },
    uFogDensity: { value: 0.0118 },
  }]);
  uniforms.uLampPos = lamps.uLampPos; uniforms.uLampDir = lamps.uLampDir; uniforms.uLampCol = lamps.uLampCol; uniforms.uLampFill = lamps.uLampFill;
  const mat = new T.ShaderMaterial({ uniforms, vertexShader: STEAM_VS, fragmentShader: STEAM_FS, lights: true, transparent: true, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'Steam';
  root.add(mesh);
  const P = Array.from({ length: N }, (_, i) => ({ e: i % emitters.length, age: Math.random() * 5, life: 4 + Math.random() * 2.5, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, seed: Math.random() }));
  for (const p of P) respawn(p, true);
  function respawn(p, pre = false) {
    const e = emitters[p.e];
    p.x = e.x + (Math.random() - 0.5) * 0.35; p.y = e.y + Math.random() * 0.2; p.z = e.z + (Math.random() - 0.5) * 0.35;
    p.vx = 0.18 + (Math.random() - 0.5) * 0.25; p.vy = 0.55 + Math.random() * 0.7 * e.rate; p.vz = 0.08 + (Math.random() - 0.5) * 0.25;
    p.life = 3.8 + Math.random() * 2.8;
    if (!pre) p.age = 0;
    else { const a = p.age; p.age = 0; step(p, Math.min(a, p.life * 0.98)); }
  }
  function step(p, dt) {
    p.age += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy *= Math.exp(-dt * 0.25);
    p.vx += 0.05 * dt;
    p.rot += p.vr * dt;
  }
  const water = buildWater(ctx);
  let t = 0;
  function update(dt) {
    t += dt;
    uniforms.uLampCount.value = lamps.count;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      step(p, dt);
      if (p.age > p.life) respawn(p);
      const k = p.age / p.life;
      const size = 0.45 + k * 3.0 * (0.8 + p.seed * 0.4);
      const alpha = Math.min(1, k * 6) * Math.pow(1 - k, 1.6) * 0.22 * emitters[p.e].rate;
      aP[i * 4] = p.x; aP[i * 4 + 1] = p.y; aP[i * 4 + 2] = p.z; aP[i * 4 + 3] = size;
      aA[i * 4] = k; aA[i * 4 + 1] = p.rot; aA[i * 4 + 2] = alpha; aA[i * 4 + 3] = p.seed;
    }
    iP.needsUpdate = true; iA.needsUpdate = true;
    water.update(dt);
  }
  function setEmitter(i, x, y, z) { const e = emitters[i]; if (e) { e.x = x; e.y = y; e.z = z; } }
  return { mesh, update, emitters, setEmitter, water };
}

function buildWater(ctx) {
  const { THREE: T, root, lamps } = ctx;
  const N = 320;
  const geo = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const aP = new Float32Array(N * 4), aV = new Float32Array(N * 4);
  const iP = new T.InstancedBufferAttribute(aP, 4).setUsage(T.DynamicDrawUsage);
  const iV = new T.InstancedBufferAttribute(aV, 4).setUsage(T.DynamicDrawUsage);
  geo.setAttribute('aP', iP); geo.setAttribute('aV', iV);
  for (let i = 0; i < N; i++) aP[i * 4 + 1] = -99;
  geo.instanceCount = N;
  const mat = new T.ShaderMaterial({
    uniforms: { uLampPos: lamps.uLampPos, uLampCol: lamps.uLampCol, uLampFill: lamps.uLampFill },
    vertexShader: /* glsl */`
      attribute vec4 aP; attribute vec4 aV;
      varying vec2 vUv; varying float vA; varying vec3 vW;
      void main() {
        vec4 mv = viewMatrix * vec4( aP.xyz, 1.0 );
        vec3 vv = ( viewMatrix * vec4( aV.xyz, 0.0 ) ).xyz;
        vec2 dir = length( vv.xy ) > 1e-4 ? normalize( vv.xy ) : vec2( 0.0, 1.0 );
        vec2 side = vec2( dir.y, -dir.x );
        float len = aP.w * ( 1.0 + length( aV.xyz ) * 0.05 );
        mv.xy += dir * position.y * len + side * position.x * aP.w * 0.22;
        vUv = uv; vA = aV.w; vW = aP.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA; varying vec3 vW;
      void main() {
        float r = length( ( vUv - 0.5 ) * vec2( 2.0, 2.0 ) );
        float a = smoothstep( 1.0, 0.2, r ) * vA;
        vec3 c = vec3( 0.5, 0.58, 0.68 ) * 0.4 + vec3( 1.0, 0.7, 0.45 ) * 0.16;
        gl_FragColor = vec4( c * a, a * 0.5 );
      }`,
    transparent: true, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'HydrantWater';
  mesh.renderOrder = 7;
  root.add(mesh);
  const P = Array.from({ length: N }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, age: 9, life: 1 }));
  const jets = [];
  let next = 0;
  function start(x, y, z, dx, dz) { jets.push({ x, y, z, dx, dz, t: 0 }); }
  function update(dt) {
    if (!jets.length) return;
    for (const j of jets) {
      j.t += dt;
      const rate = 230;
      let n = Math.floor(j.t * rate) - Math.floor((j.t - dt) * rate);
      while (n-- > 0) {
        const p = P[next]; next = (next + 1) % N;
        const sp = 7.5 + Math.random() * 2.5, spread = 0.12;
        p.x = j.x; p.y = j.y; p.z = j.z;
        p.vx = (j.dx + (Math.random() - 0.5) * spread) * sp; p.vy = (0.55 + Math.random() * 0.25) * sp; p.vz = (j.dz + (Math.random() - 0.5) * spread) * sp;
        p.age = 0; p.life = 1.1 + Math.random() * 0.4;
      }
    }
    let c = 0;
    for (const p of P) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.vy -= 9.81 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.15; p.vx *= 0.4; p.vz *= 0.4; }
      aP[c * 4] = p.x; aP[c * 4 + 1] = p.y; aP[c * 4 + 2] = p.z; aP[c * 4 + 3] = 0.12 + p.age * 0.25;
      aV[c * 4] = p.vx; aV[c * 4 + 1] = p.vy; aV[c * 4 + 2] = p.vz; aV[c * 4 + 3] = (1 - p.age / p.life);
      c++;
    }
    for (let i = c; i < N; i++) { aP[i * 4 + 1] = -99; aV[i * 4 + 3] = 0; }
    iP.needsUpdate = true; iV.needsUpdate = true;
  }
  return { mesh, start, update, jets };
}
