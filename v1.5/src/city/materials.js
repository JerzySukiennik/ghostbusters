// City materials: procedural wet asphalt with paint, sidewalks/kerbs/parks, brick-array facades with parallax windows, lit rooms and storefronts, trims, fire-escape iron, signs, signal lenses, far skyline boxes, height fog.
import { patchMaterial } from '../world/materials.js';
import { SHOP_TINTS } from './build.js';

export const FOG = { density: 0.0088, high: 0.3 };

export function noiseTexture(THREE, N = 256) {
  const data = new Uint8Array(N * N * 4);
  const grid = (g, seed) => {
    const v = new Float32Array(g * g);
    let s = seed >>> 0;
    for (let i = 0; i < v.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; v[i] = s / 4294967296; }
    return (x, y) => {
      const fx = (x / N) * g, fy = (y / N) * g;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const at = (a, b) => v[((b % g + g) % g) * g + ((a % g + g) % g)];
      return (at(x0, y0) * (1 - ux) + at(x0 + 1, y0) * ux) * (1 - uy) + (at(x0, y0 + 1) * (1 - ux) + at(x0 + 1, y0 + 1) * ux) * uy;
    };
  };
  const oct = [[4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128], [2, 4, 8, 16]].map((gs, c) => gs.map((g, k) => grid(g, 101 + c * 17 + k * 5)));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (y * N + x) * 4;
    for (let c = 0; c < 4; c++) {
      let s = 0, a = 0.5, t = 0;
      for (const f of oct[c]) { s += f(x, y) * a; t += a; a *= 0.5; }
      data[k + c] = Math.max(0, Math.min(255, Math.round((s / t) * 255)));
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function textureArray(THREE, images, size, srgb) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * images.length);
  images.forEach((img, i) => {
    g.clearRect(0, 0, size, size);
    if (img) g.drawImage(img, 0, 0, size, size);
    else { g.fillStyle = srgb ? '#806050' : '#8080ff'; g.fillRect(0, 0, size, size); }
    data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const t = new THREE.DataArrayTexture(data, size, size, images.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const HFOG = /* glsl */`
#ifdef USE_FOG
{
  float fd = length( vPlateWorld - cameraPosition );
  float hy = max( max( vPlateWorld.y, cameraPosition.y * 0.6 ), 0.0 );
  float dens = fogDensity * mix( 1.0, uFogHigh, smoothstep( 10.0, 110.0, hy ) );
  float ff = 1.0 - exp( - dens * dens * fd * fd );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, ff );
}
#endif
`;

const WET_PARS = /* glsl */`
uniform sampler2D uNoise, uRipple;
uniform vec4 uHydrant, uHydrant2;
uniform float uWetness;
uniform vec3 uSheen;
varying vec3 vDec;
float gWet, gPud, gPaint, gGut;
`;

const WET_CORE = (paint) => /* glsl */`
{
  vec2 wp = vPlateWorld.xz;
  vec4 n1 = texture2D( uNoise, wp * 0.0161 );
  vec4 n2 = texture2D( uNoise, wp * 0.0713 + vec2( 0.37, 0.11 ) );
  vec4 n3 = texture2D( uNoise, wp * 0.0043 + vec2( 0.71, 0.29 ) );
  gGut = vDec.x < 0.5 ? vDec.y : 0.0;
  float grime = 0.5 + ( n3.r - 0.5 ) * 1.1 + ( n2.b - 0.5 ) * 0.4;
  #ifdef USE_MAP
  vec3 alt = texture2D( map, vMapUv * 0.41 + vec2( 0.37, 0.71 ) ).rgb;
  diffuseColor.rgb = mix( diffuseColor.rgb, alt, smoothstep( 0.35, 0.65, n1.g ) * 0.55 );
  float altL = dot( alt, vec3( 0.333 ) );
  #else
  float altL = 0.5;
  #endif
  diffuseColor.rgb *= mix( 0.62, 1.22, grime );
  gPaint = 0.0;
  ${paint ? `
  if ( vDec.x > 0.5 ) {
    float wear = smoothstep( 0.2, 0.8, altL * 1.6 + ( n2.r - 0.5 ) * 0.9 );
    float pw = ( 1.0 - 0.72 * wear );
    vec3 pc = vDec.x > 1.5 && vDec.x < 2.5 ? vec3( 0.5, 0.33, 0.05 ) : vec3( 0.4, 0.395, 0.37 );
    diffuseColor.rgb = mix( diffuseColor.rgb, pc, pw );
    gPaint = pw;
  }` : ''}
  gWet = ( 0.62 + ( n2.g - 0.5 ) * 0.55 + gGut * 0.4 ) * uWetness;
  float field = n1.r * 0.78 + n2.g * 0.22 + gGut * 0.32;
  gPud = smoothstep( 0.55, 0.625, field ) * uWetness;
  float hd = length( wp - uHydrant.xy );
  gPud = max( gPud, uHydrant.w * smoothstep( uHydrant.z, uHydrant.z * 0.35, hd ) );
  float hd2 = length( wp - uHydrant2.xy );
  gPud = max( gPud, uHydrant2.w * smoothstep( uHydrant2.z, uHydrant2.z * 0.35, hd2 ) );
  gWet = clamp( max( gWet, gPud ), 0.0, 1.0 );
  diffuseColor.rgb *= mix( 1.0, 0.52, gWet );
  diffuseColor.rgb *= mix( 1.0, 0.4, gPud * ( 1.0 - gPaint * 0.5 ) );
  diffuseColor.rgb *= 1.0 - gGut * 0.38;
}
`;

const ROAD_FRAG = [
  ['lights_fragment_maps', /* glsl */`
    #if defined( RE_IndirectSpecular )
    {
      vec3 wN2 = inverseTransformDirection( geometryNormal, viewMatrix );
      vec3 wV2 = inverseTransformDirection( geometryViewDir, viewMatrix );
      vec3 rw = reflect( -wV2, wN2 );
      float el = clamp( rw.y, 0.0, 1.0 );
      radiance += uSheen * exp( -el * 7.0 ) * ( 0.35 + 0.65 * gWet ) * ( 1.0 - 0.5 * gPaint );
    }
    #endif
  `],
  ['map_fragment', WET_CORE(true)],
  ['roughnessmap_fragment', /* glsl */`
    roughnessFactor = mix( roughnessFactor, 0.085, smoothstep( 0.45, 0.92, gWet ) * 0.92 );
    roughnessFactor = mix( roughnessFactor, 0.04, gPud );
    roughnessFactor = mix( roughnessFactor, 0.42, gPaint * 0.6 * ( 1.0 - gPud ) );
  `],
  ['normal_fragment_maps', /* glsl */`
    if ( gWet > 0.45 || gPud > 0.02 ) {
      vec2 rp = vPlateWorld.xz;
      vec3 r1 = texture2D( uRipple, rp * 0.42 + vec2( uPlateTime * 0.011, uPlateTime * 0.006 ) ).xyz * 2.0 - 1.0;
      vec3 r2 = texture2D( uRipple, rp * 0.19 - vec2( uPlateTime * 0.007, -uPlateTime * 0.009 ) ).xyz * 2.0 - 1.0;
      vec2 sl = ( r1.xy + r2.xy * 0.8 ) * mix( 0.025, 0.1, gPud );
      vec3 nRip = normalize( ( viewMatrix * vec4( normalize( vec3( sl.x, 1.0, -sl.y ) ), 0.0 ) ).xyz );
      normal = normalize( mix( normal, nRip, max( gPud * 0.95, smoothstep( 0.5, 1.0, gWet ) * 0.6 ) ) );
    }
  `],
];

const WALK_PARS = /* glsl */`
uniform sampler2D uNoise, uAsph, uPlank, uStone;
varying vec2 vSurf;
float gWet, gPud, gS;
`;

const WALK_MAP = /* glsl */`
{
  vec2 wp = vPlateWorld.xz;
  vec4 n1 = texture2D( uNoise, wp * 0.0161 + 0.3 );
  vec4 n2 = texture2D( uNoise, wp * 0.0713 + vec2( 0.13, 0.57 ) );
  gS = floor( vSurf.x + 0.5 );
  float fac = vSurf.y;
  float grime = 0.5 + ( n1.b - 0.5 ) * 0.8;
  gWet = 0.42 + ( n2.g - 0.5 ) * 0.45;
  gPud = 0.0;
  if ( gS < 0.5 ) {
    diffuseColor.rgb *= mix( 0.66, 1.18, grime );
    gWet *= 0.45 + 0.55 * ( 1.0 - smoothstep( 0.55, 0.98, fac ) );
    gPud = smoothstep( 0.66, 0.72, n1.r * 0.7 + n2.g * 0.3 + ( 1.0 - fac ) * 0.06 ) * 0.85;
    diffuseColor.rgb *= mix( 1.0, 0.55, smoothstep( 0.82, 1.0, fac ) );
  } else if ( gS < 1.5 ) {
    diffuseColor.rgb = diffuseColor.rgb * vec3( 0.62, 0.63, 0.66 ) * mix( 0.7, 1.1, n2.r );
    gWet = 0.7;
  } else if ( gS < 2.5 ) {
    float h = n2.b;
    vec3 leaf = mix( vec3( 0.2, 0.11, 0.035 ), vec3( 0.3, 0.2, 0.06 ), h );
    vec3 grass = mix( vec3( 0.035, 0.06, 0.022 ), vec3( 0.08, 0.11, 0.035 ), n1.g );
    diffuseColor.rgb = mix( grass, leaf, smoothstep( 0.45, 0.7, n2.r ) * 0.7 );
    gWet = 0.3;
  } else if ( gS < 3.5 ) {
    vec3 st = texture2D( uStone, wp / 2.4 ).rgb;
    diffuseColor.rgb = st * vec3( 0.62, 0.6, 0.57 ) * mix( 0.75, 1.15, grime );
    gPud = smoothstep( 0.68, 0.74, n1.r * 0.7 + n2.g * 0.3 ) * 0.8;
  } else if ( gS < 4.5 ) {
    diffuseColor.rgb = texture2D( uAsph, wp / 3.2 ).rgb * mix( 0.7, 1.0, grime );
    gWet = 0.6;
    gPud = smoothstep( 0.6, 0.68, n1.r * 0.8 + n2.g * 0.2 ) * 0.8;
  } else if ( gS < 5.5 ) {
    diffuseColor.rgb = vec3( 0.006, 0.008, 0.009 );
    gWet = 1.0; gPud = 1.0;
  } else {
    diffuseColor.rgb = texture2D( uPlank, wp / 1.5 ).rgb * 0.55 * mix( 0.7, 1.1, grime );
    gWet = 0.6;
  }
  gWet = max( gWet, gPud );
  diffuseColor.rgb *= mix( 1.0, 0.6, gWet * 0.8 );
  diffuseColor.rgb *= mix( 1.0, 0.45, gPud );
}
`;

const FACADE_PARS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uBrick, uBrickN;
uniform sampler2D uNoise, uShutter;
uniform vec3 uShopTint[ 10 ];
uniform float uFogHigh;
varying vec4 vFac, vFac2, vShop;
varying vec2 vUvM;
varying vec3 vNW;
vec3 gEmis, gNt;
float gRough, gMetal;

float h11( float n ) { return fract( sin( n * 91.345 ) * 47453.5453 ); }
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }

vec3 wallpaper( float s ) {
  float k = floor( s * 7.0 );
  vec3 c = vec3( 0.72, 0.62, 0.45 );
  if ( k == 1.0 ) c = vec3( 0.55, 0.62, 0.5 ); else if ( k == 2.0 ) c = vec3( 0.62, 0.56, 0.64 ); else if ( k == 3.0 ) c = vec3( 0.78, 0.72, 0.6 );
  else if ( k == 4.0 ) c = vec3( 0.5, 0.58, 0.68 ); else if ( k == 5.0 ) c = vec3( 0.72, 0.5, 0.42 ); else if ( k == 6.0 ) c = vec3( 0.82, 0.8, 0.74 );
  return c;
}

vec3 interior( vec3 rd, vec2 wuv, float W, float H, float D, float seed, float type, vec3 tint ) {
  rd.z = min( rd.z, -0.02 );
  float mx = type > 0.5 ? 0.6 : 0.9;
  vec3 ro = vec3( wuv.x * W, wuv.y * H, 0.0 );
  vec3 bmin = vec3( -mx, type > 0.5 ? -0.6 : -0.95, -D ), bmax = vec3( W + mx, H + ( type > 0.5 ? 0.6 : 0.55 ), 0.0 );
  vec3 t1 = ( bmin - ro ) / rd, t2 = ( bmax - ro ) / rd;
  vec3 tf = max( t1, t2 );
  float t = min( min( tf.x, tf.y ), tf.z );
  vec3 hp = ro + rd * t;
  vec3 lampP = vec3( W * 0.5 + ( h11( seed * 3.1 ) - 0.5 ) * W * 0.6, bmax.y - 0.15, -D * ( 0.35 + 0.3 * h11( seed * 5.7 ) ) );
  float ld = length( hp - lampP );
  float light = 1.0 / ( 1.0 + ld * ld * ( type > 0.5 ? 0.06 : 0.35 ) );
  vec3 wall = type > 0.5 ? vec3( 0.75, 0.74, 0.7 ) : wallpaper( h11( seed * 7.7 ) );
  vec3 col;
  if ( type > 0.5 ) {
    if ( t == tf.y && rd.y > 0.0 ) {
      float zz = fract( -hp.z / 1.7 );
      float tubes = step( abs( zz - 0.5 ), 0.045 ) * step( abs( hp.x - W * 0.5 ), W * 0.3 );
      col = vec3( 0.42 ) + vec3( 5.0 ) * tubes;
    } else if ( t == tf.y ) {
      vec2 ck = floor( hp.xz / 0.3 );
      col = mod( ck.x + ck.y, 2.0 ) < 1.0 ? vec3( 0.42, 0.41, 0.38 ) : vec3( 0.05 );
    } else {
      bool back = t == tf.z;
      vec2 q = back ? hp.xy : vec2( -hp.z, hp.y );
      col = wall * ( back ? 0.5 : 0.32 );
      float band = floor( q.y / 0.5 );
      float inShelf = step( -0.4, q.y ) * step( q.y, 1.9 );
      float hb = h11( floor( q.x / 0.19 + band * 3.7 ) * 1.31 + band * 7.3 + seed * 13.0 );
      vec3 goods = vec3( h11( hb * 9.1 ), h11( hb * 3.3 + 1.0 ), h11( hb * 5.7 + 2.0 ) );
      goods = mix( goods, vec3( dot( goods, vec3( 0.33 ) ) ), 0.5 ) * 0.7;
      float gy = fract( q.y / 0.5 );
      float item = step( 0.1, gy ) * step( gy, 0.1 + 0.6 * ( 0.5 + 0.5 * hb ) ) * step( 0.12, fract( q.x / 0.19 + band * 3.7 ) ) * step( 0.3, hb );
      col = mix( col, goods * ( back ? 1.0 : 0.6 ), item * inShelf );
      col = mix( col, vec3( 0.25, 0.26, 0.27 ), step( gy, 0.07 ) * inShelf );
      if ( back && q.y > 2.0 && q.y < 2.6 && abs( q.x - W * 0.5 ) < W * 0.3 ) col = mix( col, tint * 0.9, 0.7 );
    }
    col *= ( 1.0 - smoothstep( 0.0, D * 1.1, -hp.z ) * 0.4 ) * 0.5;
  } else if ( t == tf.z ) {
    col = wall;
    vec2 q = hp.xy;
    float fr = h11( seed * 11.3 );
    float fx0 = W * ( 0.1 + 0.5 * fr ), fx1 = fx0 + W * 0.45;
    if ( q.x > fx0 && q.x < fx1 && q.y < bmin.y + 1.0 + fr * 0.6 ) col *= 0.25;
    if ( q.x > fx1 + 0.3 && q.x < fx1 + 0.75 && q.y > 0.4 && q.y < 1.0 ) col = mix( col, vec3( 0.15, 0.1, 0.08 ), 0.8 );
  } else if ( t == tf.y ) {
    col = rd.y > 0.0 ? vec3( 0.85, 0.84, 0.8 ) * ( 1.2 + 1.5 * exp( -length( hp.xz - lampP.xz ) * 1.2 ) ) : vec3( 0.22, 0.14, 0.08 );
  } else {
    col = wall * 0.75;
  }
  col *= type > 0.5 ? 0.9 : light;
  if ( type < 0.5 && h11( seed * 17.1 ) > 0.86 ) col = mix( col, vec3( 0.35, 0.5, 1.0 ) * ( 0.55 + 0.45 * sin( uPlateTime * 9.0 + seed * 40.0 ) * sin( uPlateTime * 3.1 + seed ) ), 0.65 );
  if ( type < 0.5 ) {
    float cur = h11( seed * 23.7 );
    if ( cur < 0.4 ) {
      float lvl = 0.35 + 0.6 * h11( seed * 29.3 );
      if ( wuv.y > lvl ) col = mix( tint * 0.9 * ( 0.6 + 0.4 * light ), col, smoothstep( 0.35, 0.5, fract( wuv.y * H / 0.035 ) ) * 0.35 );
    } else if ( cur < 0.8 ) {
      float c0 = 0.22 + 0.15 * h11( seed * 31.0 ), c1 = 0.78 - 0.15 * h11( seed * 37.0 );
      vec3 cloth = mix( vec3( 0.75, 0.68, 0.55 ), vec3( 0.6, 0.12, 0.08 ), step( 0.6, h11( seed * 41.0 ) ) );
      if ( wuv.x < c0 || wuv.x > c1 ) col = cloth * ( 0.75 + 0.25 * sin( wuv.x * 70.0 + seed * 9.0 ) ) * 0.9;
    }
  }
  return col;
}

vec3 roomTint( float s ) {
  float k = floor( s * 5.0 );
  return k < 1.0 ? vec3( 1.0, 0.62, 0.32 ) : k < 2.0 ? vec3( 1.0, 0.7, 0.42 ) : k < 3.0 ? vec3( 1.0, 0.78, 0.55 ) : k < 4.0 ? vec3( 0.75, 0.85, 1.0 ) : vec3( 1.0, 0.55, 0.3 );
}

void glassAt( vec3 rd, vec2 local, vec2 wh, float depth, float seed, float type, float lit, vec3 tint, float dist, vec3 frameCol ) {
  float t = depth / max( -rd.z, 0.05 );
  vec2 hit = local + rd.xy * t;
  bool inGlass = hit.x > 0.0 && hit.x < wh.x && hit.y > 0.0 && hit.y < wh.y;
  if ( !inGlass ) {
    float top = step( wh.y, hit.y );
    float sill = step( hit.y, 0.0 );
    vec3 c = diffuseColor.rgb * mix( 0.32, 0.18, top );
    c = mix( c, diffuseColor.rgb * 0.6, sill );
    diffuseColor.rgb = c;
    gRough = 0.9;
    return;
  }
  float ft = type > 0.5 ? 0.05 : 0.055;
  float fr = step( hit.x, ft ) + step( wh.x - ft, hit.x ) + step( hit.y, ft ) + step( wh.y - ft, hit.y );
  if ( type < 0.5 ) fr += step( abs( hit.y - wh.y * 0.5 ), 0.03 );
  if ( fr > 0.0 ) { diffuseColor.rgb = frameCol; gRough = 0.5; gEmis = frameCol * lit * 0.02; return; }
  vec3 room;
  if ( dist < 150.0 ) room = interior( rd, hit / wh, wh.x, wh.y, 3.6, seed, type, tint );
  else room = ( type > 0.5 ? vec3( 0.42 ) : wallpaper( h11( seed * 7.7 ) ) * 0.55 );
  gEmis = room * tint * lit + room * 0.0025;
  diffuseColor.rgb = vec3( 0.012 );
  gRough = 0.05 + 0.08 * h11( seed * 3.7 );
}

void facade() {
  float kind = floor( vFac.x + 0.5 );
  vec2 p = vUvM;
  float seedW = vFac.y, bay = max( vFac.z, 0.4 ), roofRel = vFac.w;
  float gf = vFac2.x, fl = max( vFac2.y, 2.0 ), layer = vFac2.z, tint = vFac2.w;
  vec3 Nw = normalize( vNW );
  float dist = length( vPlateWorld - cameraPosition );
  gEmis = vec3( 0.0 ); gNt = vec3( 0.0, 0.0, 1.0 ); gRough = 0.92; gMetal = 0.0;
  float sc = layer > 3.5 ? 2.4 : ( layer > 0.5 && layer < 1.5 ? 2.0 : 1.0 );
  vec2 buv = ( kind > 8.5 && kind < 9.5 ) || ( kind > 10.5 && kind < 11.5 ) ? vPlateWorld.xz / sc : p / sc;
  vec3 bc = texture( uBrick, vec3( buv, layer ) ).rgb;
  gNt = normalize( texture( uBrickN, vec3( buv, layer ) ).xyz * 2.0 - 1.0 );
  float tk = 0.8 + tint * 0.32;
  vec3 tcol = vec3( tk * ( 0.96 + h11( tint * 7.0 ) * 0.08 ), tk, tk * ( 0.94 + h11( tint * 3.0 ) * 0.08 ) );
  diffuseColor.rgb = bc * tcol;
  vec4 nz = texture2D( uNoise, vPlateWorld.xz * 0.05 + vPlateWorld.y * 0.013 );
  if ( kind == 9.0 ) {
    vec4 rn = texture2D( uNoise, vPlateWorld.xz * 0.11 );
    diffuseColor.rgb = vec3( 0.075, 0.072, 0.07 ) * mix( 0.55, 1.3, rn.r ) * mix( 0.8, 1.2, tint );
    gNt = vec3( 0.0, 0.0, 1.0 );
    gRough = mix( 0.85, 0.25, smoothstep( 0.55, 0.7, rn.g ) );
    return;
  }
  if ( kind == 11.0 ) { diffuseColor.rgb = vec3( 0.42, 0.4, 0.37 ) * mix( 0.6, 1.0, nz.r ); gRough = 0.7; return; }
  if ( kind >= 10.0 ) { diffuseColor.rgb *= 0.78; return; }
  diffuseColor.rgb *= mix( 0.55, 1.0, smoothstep( 0.0, 2.6, p.y ) ) * ( 0.88 + 0.24 * nz.g );
  if ( kind == 4.0 ) {
    vec3 paint = h11( seedW * 5.3 ) < 0.4 ? vec3( 0.62, 0.6, 0.53 ) : h11( seedW * 5.3 ) < 0.7 ? vec3( 0.36, 0.38, 0.34 ) : vec3( 0.16, 0.22, 0.18 );
    diffuseColor.rgb = paint * mix( 0.7, 1.05, nz.r ) * ( 0.85 + 0.3 * smoothstep( 0.2, 0.0, abs( fract( p.x / bay ) - 0.5 ) - 0.32 ) );
    gNt = vec3( 0.0, 0.0, 1.0 );
    gRough = 0.6;
  }
  if ( kind == 8.0 ) { diffuseColor.rgb = vec3( 0.55, 0.56, 0.58 ) * mix( 0.85, 1.05, nz.r ); gNt = vec3( 0.0, 0.0, 1.0 ); gRough = 0.35; gMetal = 0.6; }
  if ( kind == 7.0 ) { diffuseColor.rgb = vec3( 0.07, 0.075, 0.08 ); gNt = vec3( 0.0, 0.0, 1.0 ); gRough = 0.25; gMetal = 0.4; }
  if ( kind == 0.0 ) { diffuseColor.rgb *= 0.85; return; }
  vec3 Vw = normalize( vPlateWorld - cameraPosition );
  vec3 Tw = vec3( -Nw.z, 0.0, Nw.x );
  vec3 rd = vec3( dot( Vw, Tw ), Vw.y, dot( Vw, Nw ) );
  vec3 frameCol = h11( seedW * 9.1 ) < 0.45 ? vec3( 0.62, 0.6, 0.55 ) : h11( seedW * 9.1 ) < 0.7 ? vec3( 0.035 ) : h11( seedW * 9.1 ) < 0.85 ? vec3( 0.05, 0.12, 0.07 ) : vec3( 0.2, 0.11, 0.06 );
  vec3 trimCol = vec3( 0.62, 0.58, 0.51 ) * ( 0.75 + 0.3 * h11( seedW * 2.3 ) );
  if ( p.y < gf ) {
    float st = floor( vShop.x + 0.5 );
    float s0 = vShop.z, s1 = vShop.w;
    vec3 shopTint = uShopTint[ int( clamp( vShop.y, 0.0, 9.0 ) ) ];
    if ( kind == 6.0 || kind == 3.0 || kind == 13.0 ) { diffuseColor.rgb = texture( uBrick, vec3( p / 2.4, 4.0 ) ).rgb * vec3( 0.7, 0.68, 0.64 ) * mix( 0.6, 1.0, smoothstep( 0.0, 2.0, p.y ) ); gNt = normalize( texture( uBrickN, vec3( p / 2.4, 4.0 ) ).xyz * 2.0 - 1.0 ); }
    if ( st == 1.0 || st == 2.0 ) {
      if ( p.x > s0 && p.x < s1 && p.y < 3.25 ) {
        gNt = vec3( 0.0, 0.0, 1.0 );
        if ( st == 2.0 ) {
          vec2 su = vec2( p.x - s0, p.y ) / 1.2;
          vec3 sh = texture2D( uShutter, su ).rgb;
          float gr = h11( seedW * 13.7 );
          vec4 gn = texture2D( uNoise, vec2( p.x, p.y ) * 0.21 + seedW * 7.0 );
          vec3 gcol = vec3( h11( gr * 3.0 ), h11( gr * 5.0 ), h11( gr * 7.0 ) ) * 0.6;
          diffuseColor.rgb = sh * vec3( 0.6, 0.6, 0.58 );
          if ( gr > 0.35 && p.y < 2.4 ) diffuseColor.rgb = mix( diffuseColor.rgb, gcol, smoothstep( 0.55, 0.6, gn.g ) * 0.85 );
          gRough = 0.5; gMetal = 0.55;
          if ( p.y > 2.95 ) diffuseColor.rgb *= 0.5;
          return;
        }
        if ( p.y < 0.55 ) { diffuseColor.rgb = vec3( 0.1, 0.1, 0.1 ) * mix( 0.6, 1.0, nz.r ); gRough = 0.5; return; }
        if ( p.y > 3.08 ) { diffuseColor.rgb = vec3( 0.06 ); gRough = 0.5; return; }
        float mw = max( 1.0, floor( ( s1 - s0 ) / 1.7 + 0.5 ) );
        float mu = fract( ( p.x - s0 ) / ( s1 - s0 ) * mw );
        if ( mu < 0.02 || mu > 0.98 ) { diffuseColor.rgb = vec3( 0.3, 0.31, 0.32 ); gRough = 0.4; gMetal = 0.6; return; }
        vec2 wh = vec2( s1 - s0, 3.08 - 0.55 );
        float lit = 0.75 + 0.5 * h11( seedW * 3.3 );
        glassAt( rd, vec2( p.x - s0, p.y - 0.55 ), wh, 0.32, seedW * 17.0 + 3.0, 1.0, lit, shopTint, dist, vec3( 0.25 ) );
        return;
      }
      if ( s0 > 1.9 && p.x > 0.45 && p.x < 1.55 && p.y < 2.75 ) {
        gNt = vec3( 0.0, 0.0, 1.0 );
        if ( p.y > 2.2 ) { glassAt( rd, vec2( p.x - 0.55, p.y - 2.25 ), vec2( 0.9, 0.42 ), 0.5, seedW * 3.0, 0.0, 0.9, vec3( 1.0, 0.78, 0.5 ), dist, vec3( 0.1, 0.07, 0.05 ) ); return; }
        diffuseColor.rgb = vec3( 0.09, 0.06, 0.04 ) * 0.7; gRough = 0.6; return;
      }
      if ( p.y > 3.25 ) { diffuseColor.rgb = trimCol * 0.5; gRough = 0.7; }
      return;
    }
    if ( st == 3.0 ) {
      if ( p.x > s0 && p.x < s1 && p.y < 3.4 ) {
        float seg = fract( ( p.x - s0 ) / 4.4 );
        if ( seg > 0.12 ) { diffuseColor.rgb = texture2D( uShutter, vec2( p.x, p.y ) / 1.2 ).rgb * vec3( 0.45, 0.42, 0.38 ); gNt = vec3( 0.0, 0.0, 1.0 ); gRough = 0.55; gMetal = 0.5; }
      }
      return;
    }
    if ( st == 4.0 ) {
      if ( p.x > s0 && p.x < s1 && p.y < 3.6 ) {
        gNt = vec3( 0.0, 0.0, 1.0 );
        float mu = fract( ( p.x - s0 ) / 1.6 );
        if ( mu < 0.03 ) { diffuseColor.rgb = vec3( 0.55, 0.45, 0.25 ); gRough = 0.3; gMetal = 0.8; return; }
        glassAt( rd, vec2( p.x - s0, p.y - 0.05 ), vec2( s1 - s0, 3.5 ), 0.6, seedW * 11.0, 1.0, 1.5, vec3( 1.0, 0.82, 0.55 ), dist, vec3( 0.55, 0.45, 0.25 ) );
      }
      return;
    }
    if ( st == 0.0 ) {
      if ( p.x > s0 && p.x < s1 && p.y < 2.75 ) {
        gNt = vec3( 0.0, 0.0, 1.0 );
        if ( p.y > 2.25 ) { glassAt( rd, vec2( p.x - s0 - 0.1, p.y - 2.27 ), vec2( s1 - s0 - 0.2, 0.43 ), 0.55, seedW * 5.0, 0.0, 0.9, vec3( 1.0, 0.78, 0.5 ), dist, vec3( 0.1, 0.07, 0.05 ) ); return; }
        diffuseColor.rgb = vec3( 0.09, 0.06, 0.04 ) * 0.6; gRough = 0.6; return;
      }
      float bi = floor( p.x / bay ), bx = p.x - ( bi + 0.5 ) * bay;
      if ( abs( bx ) < 0.55 && p.y > 1.0 && p.y < 2.8 && ( p.x < s0 - 0.5 || p.x > s1 + 0.5 ) ) {
        float wseed = h21( vec2( seedW * 31.0 + bi, -1.0 ) );
        glassAt( rd, vec2( bx + 0.55, p.y - 1.0 ), vec2( 1.1, 1.8 ), 0.2, wseed, 0.0, step( 0.6, wseed ) * ( 0.6 + wseed ), roomTint( h11( wseed * 3.0 ) ), dist, frameCol );
      }
      return;
    }
    if ( kind == 2.0 ) {
      float bi = floor( p.x / bay ), bx = p.x - ( bi + 0.5 ) * bay;
      if ( h21( vec2( bi, seedW ) ) < 0.15 && abs( bx ) < 0.5 && p.y < 2.2 ) { diffuseColor.rgb = vec3( 0.12, 0.1, 0.08 ); gNt = vec3( 0.0, 0.0, 1.0 ); }
    }
    return;
  }
  if ( p.y > roofRel - 0.25 ) return;
  float k = floor( ( p.y - gf ) / fl );
  float fy = p.y - gf - k * fl;
  float bi = floor( p.x / bay );
  float bx = p.x - ( bi + 0.5 ) * bay;
  float ww = 1.08, wh = 1.72, sill = 0.88, D = 0.2, litP = 0.36, type = 0.0;
  if ( kind == 2.0 ) { ww = 0.95; wh = 1.5; sill = 0.95; D = 0.16; litP = 0.3; }
  else if ( kind == 3.0 ) { ww = min( bay * 0.56, 1.7 ); wh = 1.95; sill = 0.85; D = 0.18; litP = 0.28; type = 1.0; }
  else if ( kind == 4.0 ) { ww = bay * 0.64; wh = fl * 0.64; sill = 0.7; D = 0.22; litP = 0.3; }
  else if ( kind == 5.0 ) { ww = 1.5; wh = 2.1; sill = 0.95; D = 0.25; litP = 0.1; }
  else if ( kind == 6.0 ) { ww = 1.15; wh = 1.8; sill = 0.85; D = 0.2; litP = 0.33; }
  else if ( kind == 7.0 ) { ww = bay - 0.12; wh = fl * 0.58; sill = 0.9; D = 0.06; litP = 0.26; type = 1.0; }
  else if ( kind == 8.0 ) { ww = 0.55; wh = fl * 0.86; sill = 0.25; D = 0.08; litP = 0.3; type = 1.0; }
  else if ( kind == 13.0 ) { ww = bay * 0.55; wh = fl * 0.72; sill = 1.0; D = 0.4; litP = 0.12; }
  wh = min( wh, fl - sill - 0.25 );
  float wseed = h21( vec2( seedW * 131.0 + bi * 1.37, k * 3.1 + seedW * 17.0 ) );
  bool skip = kind == 2.0 && h11( wseed * 4.1 ) < 0.25;
  float x0 = bx + ww * 0.5, y0 = fy - sill;
  if ( kind == 1.0 || kind == 6.0 || kind == 2.0 ) {
    if ( abs( bx ) < ww * 0.5 + 0.1 && fy > sill - 0.09 && fy < sill ) { diffuseColor.rgb = trimCol * 0.9; gNt = normalize( vec3( 0.0, 0.6, 0.8 ) ); gRough = 0.75; return; }
    if ( abs( bx ) < ww * 0.5 + 0.12 && fy > sill + wh && fy < sill + wh + 0.24 && kind != 2.0 ) { diffuseColor.rgb = trimCol * ( 0.8 + 0.2 * step( 0.5, fract( ( bx + ww ) / 0.27 ) ) ); gNt = vec3( 0.0, 0.0, 1.0 ); gRough = 0.75; return; }
  }
  if ( kind == 7.0 && !( fy > sill && fy < sill + wh ) ) { diffuseColor.rgb = vec3( 0.05, 0.055, 0.06 ) * ( 0.8 + 0.4 * h11( k + seedW ) ); gRough = 0.12; gMetal = 0.3; gEmis = vec3( 0.0 ); return; }
  if ( skip || abs( bx ) > ww * 0.5 || y0 < 0.0 || y0 > wh ) return;
  if ( kind == 13.0 && y0 > wh - ww * 0.5 && length( vec2( bx, y0 - ( wh - ww * 0.5 ) ) ) > ww * 0.5 ) return;
  gNt = vec3( 0.0, 0.0, 1.0 );
  float lit = wseed < litP ? 0.55 + h11( wseed * 9.7 ) * 1.0 : ( h11( wseed * 2.1 ) < 0.1 ? 0.08 : 0.0 );
  if ( kind == 5.0 && h11( wseed * 6.6 ) < 0.3 ) { diffuseColor.rgb = vec3( 0.12, 0.09, 0.06 ); gRough = 0.8; return; }
  vec3 tnt = type > 0.5 ? mix( vec3( 0.82, 0.92, 1.0 ), vec3( 1.0, 0.95, 0.85 ), h11( wseed * 5.0 ) ) : roomTint( h11( wseed * 3.3 ) );
  glassAt( rd, vec2( x0, y0 ), vec2( ww, wh ), D, wseed, type, lit, tnt, dist, frameCol );
}
`;

export function createCityMaterials({ THREE, tx, lamps, brick, brickN, noise, signsV1, signsGen }) {
  const asphalt = tx.set('asphalt');
  const walk = tx.set('sidewalk');
  for (const t of Object.values(asphalt)) t.repeat.set(1 / 3.2, 1 / 3.2);
  for (const t of Object.values(walk)) t.repeat.set(1 / 1.55, 1 / 1.55);
  const ripple = tx.tex('tex/ripples_nor.png');
  const shutter = tx.tex('tex/shutter_diff.jpg', { srgb: true });
  const plank = tx.tex('tex/planks_diff.jpg', { srgb: true });
  const stone = tx.tex('tex/stone_diff.jpg', { srgb: true });
  const asphMap = tx.tex('tex/asphalt_diff.jpg', { srgb: true });
  const uFogHigh = { value: FOG.high };
  const U = {
    uNoise: { value: noise },
    uRipple: { value: ripple },
    uHydrant: { value: new THREE.Vector4(0, 0, 0.01, 0) },
    uHydrant2: { value: new THREE.Vector4(0, 0, 0.01, 0) },
    uWetness: { value: 1 },
    uSheen: { value: new THREE.Color(0.028, 0.037, 0.056) },
    uFogHigh,
  };
  const decVert = { vertexPars: 'attribute vec3 aDec; varying vec3 vDec;', vertexMain: 'vDec = aDec;' };
  const road = patchMaterial(new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.nor, roughnessMap: asphalt.arm, roughness: 1, metalness: 0, envMapIntensity: 1.7 }), {
    lamps, world: true, uniforms: U, fragPars: WET_PARS, frag: ROAD_FRAG, key: 'croad', ...decVert,
  });
  const decal = patchMaterial(new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.nor, roughnessMap: asphalt.arm, roughness: 1, metalness: 0, envMapIntensity: 1.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), {
    lamps, world: true, uniforms: U, fragPars: WET_PARS, frag: ROAD_FRAG, key: 'cdecal', ...decVert,
  });
  const WU = { uNoise: { value: noise }, uAsph: { value: asphMap }, uPlank: { value: plank }, uStone: { value: stone }, uFogHigh };
  const walkMat = patchMaterial(new THREE.MeshStandardMaterial({ map: walk.map, normalMap: walk.nor, roughnessMap: walk.arm, roughness: 1, metalness: 0, envMapIntensity: 1.5 }), {
    lamps, world: true, uniforms: WU, key: 'cwalk',
    vertexPars: 'attribute vec2 aSurf; varying vec2 vSurf;', vertexMain: 'vSurf = aSurf;',
    fragPars: WALK_PARS,
    frag: [
      ['map_fragment', WALK_MAP],
      ['roughnessmap_fragment', 'roughnessFactor = gS > 1.5 && gS < 2.5 ? 0.95 : mix( roughnessFactor, 0.16, smoothstep( 0.45, 0.92, gWet ) * 0.85 ); roughnessFactor = mix( roughnessFactor, 0.04, gPud ); if ( gS > 0.5 && gS < 1.5 ) roughnessFactor *= 0.6;'],
      ['normal_fragment_maps', 'if ( gS > 1.5 ) normal = nonPerturbedNormal; normal = normalize( mix( normal, nonPerturbedNormal, max( gPud, gWet * 0.4 ) ) );'],
    ],
  });
  const tints = SHOP_TINTS.map((c) => new THREE.Vector3(...c));
  const FU = { uBrick: { value: brick }, uBrickN: { value: brickN }, uNoise: { value: noise }, uShutter: { value: shutter }, uShopTint: { value: tints }, uFogHigh };
  const shell = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, emissive: 0x000000, envMapIntensity: 1.0 }), {
    lamps, world: true, uniforms: FU, key: 'cshell',
    vertexPars: 'attribute vec4 aFac; attribute vec4 aFac2; attribute vec4 aShop; varying vec4 vFac, vFac2, vShop; varying vec2 vUvM; varying vec3 vNW;',
    vertexMain: 'vFac = aFac; vFac2 = aFac2; vShop = aShop; vUvM = uv; vNW = normalize( mat3( modelMatrix ) * objectNormal );',
    fragPars: 'vec3 gDiff;\n' + FACADE_PARS.replaceAll('diffuseColor.rgb', 'gDiff'),
    frag: [
      ['map_fragment', 'gDiff = diffuseColor.rgb; facade(); diffuseColor.rgb = gDiff;'],
      ['roughnessmap_fragment', 'roughnessFactor = gRough;'],
      ['metalnessmap_fragment', 'metalnessFactor = gMetal;'],
      ['normal_fragment_maps', '{ vec3 nV = normal; vec3 Nw = normalize( vNW ); vec3 Tw = abs( Nw.y ) > 0.5 ? vec3( 1.0, 0.0, 0.0 ) : vec3( -Nw.z, 0.0, Nw.x ); vec3 Bw = abs( Nw.y ) > 0.5 ? vec3( 0.0, 0.0, -1.0 ) : vec3( 0.0, 1.0, 0.0 ); vec3 tV = normalize( ( viewMatrix * vec4( Tw, 0.0 ) ).xyz ), bV = normalize( ( viewMatrix * vec4( Bw, 0.0 ) ).xyz ); normal = normalize( tV * gNt.x * 0.8 + bV * gNt.y * 0.8 + nV * gNt.z ); }'],
      ['emissivemap_fragment', 'totalEmissiveRadiance = gEmis;'],
      ['fog_fragment', HFOG, 'replace'],
    ],
  });
  const trimTex = tx.set('stone');
  for (const t of Object.values(trimTex)) t.repeat.set(1 / 2.4, 1 / 2.4);
  const grime = /* glsl */`{ float hy = vPlateWorld.y; diffuseColor.rgb *= mix( 0.55, 1.0, smoothstep( 0.15, 2.6, hy ) ); }`;
  const trim = patchMaterial(new THREE.MeshStandardMaterial({ map: trimTex.map, normalMap: trimTex.nor, vertexColors: true, roughness: 0.85, metalness: 0 }), {
    lamps, world: true, uniforms: { uFogHigh }, key: 'ctrim', fragPars: 'uniform float uFogHigh;', frag: [['color_fragment', grime], ['fog_fragment', HFOG, 'replace']],
  });
  const iron = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x0b0c0c, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide }), {
    lamps, world: true, uniforms: { uFogHigh }, key: 'ciron',
    vertexPars: 'attribute vec2 aIron; varying vec2 vIron; varying vec2 vIUv;', vertexMain: 'vIron = aIron; vIUv = uv;',
    fragPars: 'varying vec2 vIron; varying vec2 vIUv; uniform float uFogHigh;',
    frag: [['color_fragment', /* glsl */`
      { float pt = floor( vIron.x + 0.5 );
        if ( pt == 1.0 ) { float b = fract( vIUv.x / 0.13 ); float top = step( vIUv.y, 0.04 ) + step( 0.9, vIUv.y ) + step( abs( vIUv.y - 0.14 ), 0.012 ); if ( b > 0.16 && top < 0.5 ) discard; }
        else if ( pt == 2.0 ) { float b = fract( vIUv.x / 0.16 ); if ( b > 0.45 && abs( vIUv.y ) > 0.01 ) {} }
        else if ( pt == 3.0 ) { float b = fract( vIUv.x / 0.26 ); if ( b > 0.3 ) discard; }
        else if ( pt == 4.0 ) { float b = fract( vIUv.y / 0.28 ); float side = step( vIUv.x, 0.04 ) + step( 0.4, vIUv.x ); if ( b > 0.14 && side < 0.5 ) discard; } }
    `], ['fog_fragment', HFOG, 'replace']],
  });
  const signs = new THREE.MeshStandardMaterial({ map: signsV1, emissiveMap: signsV1, emissive: new THREE.Color(1, 1, 1), roughness: 0.45, metalness: 0.0, side: THREE.DoubleSide });
  patchMaterial(signs, {
    lamps, world: true, key: 'csigns', uniforms: { uGen: { value: signsGen } },
    vertexPars: 'attribute vec3 aLit; varying vec3 vLit;',
    vertexMain: 'vLit = aLit;',
    fragPars: 'varying vec3 vLit; uniform sampler2D uGen;',
    frag: [
      ['map_fragment', '{ if ( vLit.z > 0.5 ) { vec4 g = texture2D( uGen, vMapUv ); diffuseColor = vec4( g.rgb, 1.0 ); } }'],
      ['emissivemap_fragment', /* glsl */`
        { vec3 src = vLit.z > 0.5 ? texture2D( uGen, vMapUv ).rgb : texture2D( emissiveMap, vEmissiveMapUv ).rgb;
          totalEmissiveRadiance = src;
          float fl = 1.0;
          float ph = vLit.y;
          if ( ph > 96.0 ) { float t = uPlateTime * 7.0 + ph; fl = step( 0.22, fract( sin( floor( t ) * 12.9898 ) * 43758.5453 ) ) * 0.85 + 0.15; }
          totalEmissiveRadiance *= vLit.x * fl; }
      `],
    ],
  });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1).multiplyScalar(9) });
  glow.fog = true;
  const uSigTime = { value: 0 };
  const lens = new THREE.MeshBasicMaterial({ vertexColors: true });
  lens.onBeforeCompile = (sh) => {
    sh.uniforms.uSigTime = uSigTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aSig; varying vec3 vSig;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSig = aSig;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uSigTime; varying vec3 vSig;
      float sigOn( float off, float grp, float lamp ) {
        float t = mod( uSigTime + off, 36.0 );
        float g = 0.0, y = 0.0;
        if ( grp < 0.5 ) { g = step( t, 16.0 ); y = step( 16.0, t ) * step( t, 19.0 ); }
        else { g = step( 20.5, t ) * step( t, 31.5 ); y = step( 31.5, t ) * step( t, 34.5 ); }
        float r = 1.0 - g - y;
        return lamp < 0.5 ? r : lamp < 1.5 ? y : lamp < 2.5 ? g : ( lamp < 3.5 ? ( grp < 0.5 ? step( 20.5, t ) * step( t, 28.0 ) : step( t, 13.0 ) ) : 1.0 - ( grp < 0.5 ? step( 20.5, t ) * step( t, 28.0 ) : step( t, 13.0 ) ) * ( 1.0 ) );
      }`).replace('#include <color_fragment>', '#include <color_fragment>\n{ float on = sigOn( vSig.x, vSig.y, vSig.z ); diffuseColor.rgb *= mix( 0.025, 9.0, on ); }');
  };
  lens.customProgramCacheKey = () => 'city-lens';
  return { road, decal, walk: walkMat, shell, trim, iron, signs, glow, lens, uniforms: U, uSigTime, uFogHigh };
}

export function farMaterial(THREE, fogColor, uFogHigh, mask) {
  return new THREE.ShaderMaterial({
    uniforms: { uFog: { value: fogColor }, uDensity: { value: FOG.density }, uFogHigh, uMask: { value: mask }, uTime: { value: 0 }, uMoon: { value: new THREE.Vector3(-0.42, 0.62, -0.66).normalize() } },
    vertexShader: /* glsl */`
      attribute vec4 aFarA; attribute vec4 aFarB;
      uniform sampler2D uMask;
      varying vec3 vW; varying vec3 vN; varying vec2 vF; varying vec4 vA; varying vec4 vB;
      void main() {
        float hide = texelFetch( uMask, ivec2( int( aFarB.x ), int( aFarB.y ) ), 0 ).r;
        vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec3 sx = vec3( instanceMatrix[ 0 ].xyz ), sz = vec3( instanceMatrix[ 2 ].xyz );
        float side = abs( normal.x ) > 0.5 ? ( position.z + 0.5 ) * length( sz ) : ( position.x + 0.5 ) * length( sx );
        vF = vec2( side, w.y - 0.15 );
        vN = normalize( mat3( instanceMatrix ) * normal );
        vW = w.xyz; vA = aFarA; vB = aFarB;
        gl_Position = hide > 0.5 ? vec4( 2.0, 2.0, 2.0, 1.0 ) : projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFog, uMoon; uniform float uDensity, uFogHigh, uTime;
      varying vec3 vW; varying vec3 vN; varying vec2 vF; varying vec4 vA; varying vec4 vB;
      float h11( float n ) { return fract( sin( n * 91.345 ) * 47453.5453 ); }
      float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main() {
        float seed = vA.x, kind = floor( vA.y + 0.5 ), gf = vA.z, fl = max( vA.w, 2.0 ), bay = max( vB.z, 0.5 ), brick = vB.w;
        vec3 wall = brick < 0.5 ? vec3( 0.05, 0.022, 0.016 ) : brick < 1.5 ? vec3( 0.06, 0.03, 0.018 ) : brick < 2.5 ? vec3( 0.06, 0.05, 0.035 ) : brick < 3.5 ? vec3( 0.03, 0.022, 0.018 ) : vec3( 0.055, 0.053, 0.05 );
        if ( kind == 7.0 ) wall = vec3( 0.012, 0.014, 0.016 );
        if ( kind == 8.0 ) wall = vec3( 0.07, 0.072, 0.075 );
        vec3 col = wall * ( 0.4 + 0.6 * max( dot( vN, uMoon ), 0.0 ) ) * 0.6;
        if ( abs( vN.y ) > 0.5 ) col = vec3( 0.006 );
        else if ( vF.y > gf ) {
          float k = floor( ( vF.y - gf ) / fl ), fy = vF.y - gf - k * fl;
          float bi = floor( vF.x / bay ), bx = fract( vF.x / bay );
          float ww = kind == 7.0 ? 0.92 : kind == 8.0 ? 0.55 : kind == 3.0 ? 0.56 : 0.42;
          float win = step( abs( bx - 0.5 ), ww * 0.5 ) * step( 0.85, fy ) * step( fy, kind == 8.0 ? fl - 0.3 : 0.85 + min( 1.8, fl * 0.6 ) );
          float ws = h21( vec2( seed * 131.0 + bi * 1.37 + vN.x * 7.0 + vN.z * 3.0, k * 3.1 + seed * 17.0 ) );
          float litP = kind == 3.0 || kind == 7.0 || kind == 8.0 ? 0.27 : kind == 5.0 ? 0.1 : 0.34;
          float lit = step( ws, litP ) * ( 0.55 + h11( ws * 9.7 ) );
          vec3 tnt = kind == 3.0 || kind == 7.0 || kind == 8.0 ? vec3( 0.75, 0.85, 0.95 ) : mix( vec3( 1.0, 0.62, 0.32 ), vec3( 1.0, 0.78, 0.55 ), h11( ws * 3.3 ) );
          col = mix( col, vec3( 0.004 ) + tnt * lit * 0.42, win );
        }
        float fd = length( vW - cameraPosition );
        float hy = max( max( vW.y, cameraPosition.y * 0.6 ), 0.0 );
        float dens = uDensity * mix( 1.0, uFogHigh, smoothstep( 10.0, 110.0, hy ) );
        col = mix( col, uFog, 1.0 - exp( -dens * dens * fd * fd ) );
        gl_FragColor = vec4( col, 1.0 );
      }`,
    fog: false,
  });
}
