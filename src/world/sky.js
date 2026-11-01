// Night sky dome with low city-glow clouds and moon, fog, distant skyline towers and fake street lights receding into the fog.
import { PLATE, rng } from './layout.js';

export const NIGHT = {
  zenith: [0.0016, 0.0022, 0.0042],
  horizon: [0.0062, 0.0074, 0.0098],
  glow: [0.011, 0.0075, 0.0045],
  fog: [0.0095, 0.0122, 0.018],
  fogDensity: 0.0118,
  moonDir: [-0.42, 0.62, -0.66],
};

export function buildSky(ctx) {
  const { THREE, root, scene } = ctx;
  const moonDir = new THREE.Vector3(...NIGHT.moonDir).normalize();
  const uniforms = {
    uZenith: { value: new THREE.Color().setRGB(...NIGHT.zenith) },
    uHorizon: { value: new THREE.Color().setRGB(...NIGHT.horizon) },
    uGlow: { value: new THREE.Color().setRGB(...NIGHT.glow) },
    uFog: { value: new THREE.Color().setRGB(...NIGHT.fog) },
    uMoon: { value: moonDir },
    uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(820, 48, 24), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uGlow, uFog, uMoon; uniform float uTime;
      varying vec3 vDir;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float noise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y ); }
      float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i ++ ) { s += a * noise( p ); p *= 2.07; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        vec3 col = mix( uHorizon, uZenith, smoothstep( 0.0, 0.45, h ) );
        col += uGlow * exp( -max( h, 0.0 ) * 7.0 );
        vec2 p = d.xz / max( h + 0.12, 0.05 ) * 0.9 + vec2( uTime * 0.004, uTime * 0.0015 );
        float c = fbm( p * 1.3 );
        float cl = smoothstep( 0.42, 0.78, c ) * smoothstep( 0.0, 0.18, h );
        vec3 cloudCol = uGlow * ( 1.3 * exp( -h * 3.0 ) ) + uHorizon * 0.6;
        col = mix( col, cloudCol * 1.15, cl * 0.85 );
        float m = max( dot( d, uMoon ), 0.0 );
        float moonDisc = smoothstep( 0.99955, 0.99968, m );
        col += vec3( 0.75, 0.8, 0.9 ) * ( moonDisc * 0.9 + pow( m, 900.0 ) * 0.08 + pow( m, 30.0 ) * 0.006 ) * ( 1.0 - cl * 0.85 );
        col = mix( uFog, col, smoothstep( -0.06, 0.03, h ) );
        gl_FragColor = vec4( col, 1.0 );
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.name = 'Sky';
  sky.renderOrder = 900;
  sky.frustumCulled = false;
  root.add(sky);
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(...NIGHT.fog), NIGHT.fogDensity);
  scene.background = new THREE.Color().setRGB(...NIGHT.fog);

  const skyline = buildSkyline(THREE);
  root.add(skyline.mesh);
  const far = buildFarLights(THREE);
  root.add(far);
  return { sky, uniforms, moonDir, skyline, far, update(t) { uniforms.uTime.value = t; skyline.mat.uniforms.uTime.value = t; } };
}

function buildSkyline(THREE) {
  const R = rng(1983);
  const towers = [];
  const ring = (n, r0, r1, h0, h1, aOff = 0) => {
    for (let i = 0; i < n; i++) {
      const a = aOff + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.25;
      const r = r0 + R() * (r1 - r0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const w = 18 + R() * 30, d = 18 + R() * 30, h = h0 + Math.pow(R(), 1.6) * (h1 - h0);
      towers.push([x, z, w, d, h, R(), 0.04 + R() * 0.14, R()]);
    }
  };
  ring(18, 230, 330, 25, 80);
  for (let i = 0; i < 6; i++) towers.push([-46 + i * 17 + R() * 5, -205 - R() * 70, 26 + R() * 12, 24, 70 + R() * 80, R(), 0.14 + R() * 0.14, 0.05]);
  ring(26, 340, 520, 50, 170, 0.1);
  ring(20, 540, 760, 90, 240, 0.2);
  towers.push([-22, 690, 38, 38, 255, 0.11, 0.22, 0.1]);
  towers.push([28, 712, 38, 38, 252, 0.57, 0.2, 0.1]);
  towers.push([60, -640, 34, 34, 270, 0.33, 0.25, 0.6]);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const n = towers.length;
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 3);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: new THREE.Color().setRGB(...NIGHT.fog) }, uTime: { value: 0 }, uDensity: { value: 0.0027 } },
    vertexShader: /* glsl */`
      attribute vec4 aT; attribute vec3 aS;
      varying vec3 vW; varying vec3 vL; varying vec3 vN; varying vec4 vT; varying vec3 vS;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vW = w.xyz; vL = position; vN = normal; vT = aT; vS = aS;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFog; uniform float uTime, uDensity;
      varying vec3 vW; varying vec3 vL; varying vec3 vN; varying vec4 vT; varying vec3 vS;
      float h21( vec2 p ) { return fract( sin( dot( p, vec2( 41.3, 289.1 ) ) ) * 43758.5453 ); }
      void main() {
        float side = abs( vN.x ) > 0.5 ? vL.z * vS.z : vL.x * vS.x;
        float y = vL.y * vS.y;
        vec2 cell = vec2( floor( side / 2.4 ), floor( y / 3.6 ) );
        vec2 f = vec2( fract( side / 2.4 ), fract( y / 3.6 ) );
        float win = step( 0.18, f.x ) * step( f.x, 0.82 ) * step( 0.25, f.y ) * step( f.y, 0.8 );
        float on = step( h21( vec2( floor( side / 9.0 ), cell.y ) + vT.x * 91.0 + vN.xz * 7.0 ), vT.y ) * step( 0.12, h21( cell * 0.37 + 5.0 ) );
        float band = step( 0.5, fract( floor( y / 3.6 ) * 0.37 + vT.x ) );
        vec3 warm = vec3( 1.0, 0.72, 0.4 ), cool = vec3( 0.66, 0.95, 0.85 );
        vec3 wc = mix( cool, warm, step( vT.z, h21( cell * 1.7 ) ) ) * ( 0.35 + 0.65 * h21( cell * 3.1 ) );
        vec3 col = vec3( 0.0007, 0.0008, 0.001 ) + wc * win * on * ( 0.55 + band * 0.3 ) * 1.1;
        if ( abs( vN.y ) > 0.5 ) col = vec3( 0.0015 );
        float top = step( vS.y - 1.0, y ) * step( 120.0, vS.y );
        float blink = step( 0.5, fract( uTime * 0.5 + vT.x ) );
        col += vec3( 1.0, 0.05, 0.02 ) * top * blink * 6.0 * step( abs( side - vS.x * 0.0 ), 2.0 );
        float dist = length( vW - cameraPosition );
        float fogF = 1.0 - exp( -uDensity * uDensity * dist * dist );
        col = mix( col, uFog, fogF );
        gl_FragColor = vec4( col, 1.0 );
      }`,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  towers.forEach(([x, z, w, d, h, seed, dens, warm], i) => {
    m4.makeScale(w, h, d).setPosition(x, -60, z);
    m4.makeScale(w, h + 60, d); m4.setPosition(x, -60, z);
    mesh.setMatrixAt(i, m4);
    aT.set([seed, dens, 0.35 + warm * 0.4, h], i * 4);
    aS.set([w, h + 60, d], i * 3);
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 3));
  mesh.frustumCulled = false;
  mesh.name = 'Skyline';
  return { mesh, mat };
}

function buildFarLights(THREE) {
  const pts = [];
  const H = PLATE.half;
  for (let k = 0; k < 9; k++) {
    const d = H + 14 + k * 26;
    pts.push([-10.6 + 2.6, 9.0, -d], [10.6 - 2.6, 9.0, -d - 13], [-10.6 + 2.6, 9.0, d], [10.6 - 2.6, 9.0, d + 13]);
    pts.push([-d, 9.0, -6.6 + 2.6], [d + 10, 9.0, 6.6 - 2.6], [d, 9.0, -6.6 + 2.6], [-d - 10, 9.0, 6.6 - 2.6]);
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  const n = pts.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: 0.0105 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vF;
      uniform float uFog;
      void main() {
        vec3 c = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        vec4 mv = viewMatrix * vec4( c, 1.0 );
        float dist = -mv.z;
        mv.xy += position.xy * ( 1.6 + dist * 0.022 );
        vUv = uv;
        vF = exp( -uFog * uFog * dist * dist * 0.4 );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vF;
      void main() { float r = length( vUv - 0.5 ) * 2.0; float g = exp( -r * r * 10.0 ) + exp( -r * 3.0 ) * 0.15; g *= smoothstep( 1.0, 0.7, r );
        gl_FragColor = vec4( vec3( 1.0, 0.6, 0.3 ) * g * vF * 2.6, 1.0 ); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); mesh.setMatrixAt(i, m4); });
  mesh.frustumCulled = false;
  mesh.name = 'FarLights';
  return mesh;
}
