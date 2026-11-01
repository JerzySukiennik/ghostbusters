// Onionhead: SDF-sculpted glutton ghost (surface nets mesh), shader-driven moods, squash and stretch, struggle, trap suck; modern and film looks.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { clamp, lerp } from './util.js';
import { EYE_L, EYE_R, EYE_RL, EYE_RR, TEETH_U, TEETH_L, TONGUE, buildOnionheadArrays, decodeOnionhead } from './onionhead.js';

export function onionheadGeometry(a) {
  const g = new THREE.BufferGeometry();
  setOnionhead(g, a);
  return g;
}

export function setOnionhead(g, a) {
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  g.setAttribute('aW1', new THREE.BufferAttribute(a.w1, 4));
  g.setAttribute('aW2', new THREE.BufferAttribute(a.w2, 4));
  g.setAttribute('aNz', new THREE.BufferAttribute(a.noise, 4));
  g.setAttribute('aBump', new THREE.BufferAttribute(a.bump, 3));
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.3);
  return g;
}

export async function loadOnionhead(res) {
  try {
    const r = await fetch(new URL(`../../assets/fx/onionhead_${res}.bin`, import.meta.url));
    if (r.ok) return decodeOnionhead(await r.arrayBuffer());
  } catch (e) { }
  return buildOnionheadArrays(res);
}


const DEFORM = /* glsl */`
attribute vec4 aW1;
attribute vec4 aW2;
uniform float uTime;
uniform float uJaw;
uniform float uSmile;
uniform vec4 uBrow;
uniform vec4 uTongue;
uniform vec4 uArmL;
uniform vec4 uArmR;
uniform vec4 uTail;
uniform float uPuff;
uniform vec4 uStretch;
uniform vec3 uJiggle;
uniform float uWobble;
uniform float uStruggle;
uniform float uSuck;
uniform vec3 uTrap;
uniform float uSquash;
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
void deform(inout vec3 p, inout vec3 n) {
  float jaw = aW1.x, arm = aW1.y, tail = aW1.z, brow = aW1.w;
  float tongue = aW2.x, crown = aW2.z, cheek = aW2.w;
  float bw = abs(brow);
  if (bw > 0.0) {
    float raise = brow > 0.0 ? uBrow.x : uBrow.y;
    float inner = clamp(1.0 - (abs(p.x) - 0.05) / 0.17, 0.0, 1.0);
    p.y += bw * (raise * 0.04 - uBrow.z * (inner - 0.35) * 0.06);
    p.z += bw * uBrow.z * inner * 0.012;
  }
  p += n * cheek * uPuff * 0.055;
  float corner = smoothstep(0.1, 0.26, abs(p.x)) * exp(-pow((p.y + 0.04) / 0.08, 2.0)) * smoothstep(0.05, 0.2, p.z);
  p.y += corner * uSmile * 0.05;
  if (tongue > 0.0 || aW2.y > 1.5 && aW2.y < 2.5) {
    float tw = tongue;
    float ret = 1.0 - uTongue.x;
    p += vec3(0.0, 0.03 + tw * 0.05, -0.08 - tw * 0.2) * ret * smoothstep(0.0, 0.2, tw + 0.05);
    p.y -= tw * tw * 0.12 * uTongue.x;
    p.x += sin(uTime * 13.0 - tw * 2.5) * uTongue.y * 0.08 * tw;
    p.y += sin(uTime * 8.0 - tw * 4.0) * uTongue.y * 0.04 * tw;
    p.z += uTongue.z * tw * 0.05;
  }
  if (jaw > 0.0) {
    vec3 hinge = vec3(0.0, -0.03, 0.0);
    float a = uJaw * jaw;
    p = hinge + rotX(p - hinge, a);
    n = rotX(n, a);
  }
  float aw = abs(arm);
  if (aw > 0.0) {
    float sd = arm > 0.0 ? 1.0 : -1.0;
    vec4 A = arm > 0.0 ? uArmL : uArmR;
    vec3 piv = vec3(0.33 * sd, -0.05, 0.07);
    vec3 r = p - piv;
    r = rotZ(r, A.x * sd * aw);
    r = rotX(r, -A.y * aw);
    r = rotY(r, A.z * sd * aw);
    p = piv + r;
    n = rotY(rotX(rotZ(n, A.x * sd * aw), -A.y * aw), A.z * sd * aw);
  }
  if (tail > 0.0) {
    float w = tail * tail;
    p.x += sin(uTime * 2.4 + uTail.z - tail * 3.2) * uTail.x * w;
    p.y += sin(uTime * 1.9 + uTail.z * 0.7 - tail * 2.6) * uTail.y * w;
    p.z += uTail.w * w;
  }
  p.x += sin(uTime * 1.7) * 0.035 * crown;
  p.z += sin(uTime * 1.3 + 1.0) * 0.025 * crown;
  vec3 q = p * 3.2 + uTime * vec3(0.45, 0.62, 0.53);
  p += n * (sn3(q) * 0.011 * uWobble + sin(uTime * 2.1) * 0.006);
  p += n * sn3(p * 7.5 + uTime * 11.0) * 0.022 * uStruggle;
  p.y *= 1.0 - uSquash * 0.16;
  p.xz *= 1.0 + uSquash * 0.09;
  vec3 ax = uStretch.xyz;
  float st = uStretch.w;
  float da = dot(p, ax);
  p = ax * da * st + (p - ax * da) / sqrt(st);
  float dn = dot(n, ax);
  n = normalize(ax * dn / st + (n - ax * dn) * sqrt(st));
  p += uJiggle * smoothstep(0.05, 0.6, length(p));
  if (uSuck > 0.0) {
    float D = max(length(uTrap), 0.01);
    vec3 axis = uTrap / D;
    float a = dot(p, axis);
    vec3 perp = p - axis * a;
    float near = clamp(a / 0.9 * 0.5 + 0.5, 0.0, 1.0);
    float prog = clamp(uSuck * 1.75 - (1.0 - near) * 0.75, 0.0, 1.0);
    float pr = prog * prog * (3.0 - 2.0 * prog);
    float ang = pr * 8.0 + uSuck * 4.0 + uTime * 6.0 * uSuck;
    float c = cos(ang), s = sin(ang);
    perp = perp * c + cross(axis, perp) * s;
    n = n * c + cross(axis, n) * s + axis * dot(axis, n) * (1.0 - c);
    perp *= 1.0 - pr * 0.94;
    p = axis * mix(a, D, pr * pr) + perp;
    p *= 1.0 - uSuck * uSuck * 0.3;
  }
}
`;

const BODY_VS = /* glsl */`
${NOISE}
${DEFORM}
attribute vec4 aNz;
attribute vec3 aBump;
uniform float uBump;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vMat;
varying float vTail;
varying float vJaw;
varying vec4 vNz;
void main() {
  vec3 p = position;
  vec3 n = normalize(normal + aBump * uBump);
  deform(p, n);
  vRest = position;
  vNz = aNz;
  vMat = aW2.y;
  vTail = aW1.z;
  vJaw = aW1.x;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const glv = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;
const TEETH_GLSL = [...TEETH_U, ...TEETH_L].map((q) => `d = min(d, sdRBox(p, ${glv(q)}, vec3(${q[3].toFixed(4)}, ${q[4].toFixed(4)}, ${q[5].toFixed(4)}), 0.012, ${q[6].toFixed(4)}));`).join('\n  ');
const TONGUE_GLSL = TONGUE.map((a) => `d = smin(d, sdEllA(p, ${glv(a)}, vec3(${a[3].toFixed(4)}, ${a[4].toFixed(4)}, ${a[5].toFixed(4)})), 0.06);`).join('\n  ');

const CLASSIFY = /* glsl */`
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 q = pa * l2 - ba * y; float x2 = dot(q, q);
  float y2 = y * y * l2; float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdRBox(vec3 p, vec3 c, vec3 h, float r, float tilt) {
  vec3 d = p - c;
  float cs = cos(tilt), sn = sin(tilt);
  d.xy = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec3 q = abs(d) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdEllA(vec3 p, vec3 c, vec3 r) { vec3 x = (p - c) / r; float k0 = length(x); float k1 = length(x / r); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
int classify(vec3 p) {
  if (p.z < 0.1) return 0;
  if (p.y > 0.08) {
    if (abs(p.x) > 0.26 || p.y > 0.3) return 0;
    float de = min(length(p - ${glv(EYE_L)}) - ${EYE_RL.toFixed(4)}, length(p - ${glv(EYE_R)}) - ${EYE_RR.toFixed(4)});
    return de < 0.005 ? 4 : 0;
  }
  if (abs(p.x) > 0.35 || p.y < -0.36) return 0;
  float d = 1e9;
  ${TEETH_GLSL}
  if (d < 0.004) return 3;
  d = 1e9;
  ${TONGUE_GLSL}
  if (d < 0.005) return 2;
  if (p.z > 0.05 && abs(p.x) < 0.31 && p.y < 0.06 && p.y > -0.16 && sdEllA(p, vec3(0.0, -0.04, 0.3), vec3(0.27, 0.07, 0.2)) < 0.014) return 1;
  return 0;
}
`;

const BODY_FS = /* glsl */`
${NOISE}
${CLASSIFY}
uniform float uTime;
uniform float uTimeQ;
uniform float uGlow;
uniform float uHurt;
uniform vec4 uHit;
uniform vec4 uEyes;
uniform vec3 uGazeL;
uniform vec3 uGazeR;
uniform float uBrowSlant;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmb;
uniform vec3 uLPos[4];
uniform vec3 uLCol[4];
uniform float uOpacity;
uniform float uSuck;
uniform vec3 uTint;
uniform vec3 uSelf;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vMat;
varying float vTail;
varying float vJaw;
varying vec4 vNz;
vec3 lightAll(vec3 N, vec3 V, vec3 base, float rough, float wrap, out vec3 spec) {
  vec3 diff = uAmb;
  spec = vec3(0.0);
  float a = rough * rough;
  float a2 = a * a;
  float b2 = max(a2 * 0.3, 0.001);
  float kd = max((dot(N, uKeyDir) + wrap) / (1.0 + wrap), 0.0);
  diff += uKeyCol * kd;
  vec3 H = normalize(uKeyDir + V);
  float nh = max(dot(N, H), 0.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float de = nh * nh * (b2 - 1.0) + 1.0;
  spec += uKeyCol * (a2 / (3.1416 * dd * dd) + 0.25 * b2 / (3.1416 * de * de)) * max(dot(N, uKeyDir), 0.0) * 0.25;
  for (int i = 0; i < 4; i++) {
    vec3 L = uLPos[i] - vW;
    float d2 = dot(L, L);
    L *= inversesqrt(d2);
    float att = 1.0 / (d2 + 0.6);
    vec3 so = uLPos[i] - uSelf;
    vec3 c = uLCol[i] * att * 0.32 * step(0.5, dot(so, so));
    diff += c * max((dot(N, L) + wrap) / (1.0 + wrap), 0.0);
    vec3 Hl = normalize(L + V);
    float nhl = max(dot(N, Hl), 0.0);
    float dl = nhl * nhl * (a2 - 1.0) + 1.0;
    float el = nhl * nhl * (b2 - 1.0) + 1.0;
    spec += c * (a2 / (3.1416 * dl * dl) + 0.25 * b2 / (3.1416 * el * el)) * max(dot(N, L), 0.0) * 0.25;
  }
  return base * diff;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - NV, 2.5);
  int mat = classify(vRest);
  vec3 col;
  float alpha = 1.0;
  vec3 spec;
  float tq = uTime;
#ifdef FILM
  tq = uTimeQ;
#endif
  float shadeY = smoothstep(-0.55, 0.45, vRest.y);
  if (mat == 4) {
    vec3 ec = vRest.x > 0.0 ? ${glv(EYE_L)} : ${glv(EYE_R)};
    vec3 en = normalize(vRest - ec);
    vec3 gz = vRest.x > 0.0 ? uGazeL : uGazeR;
    float lid = vRest.x > 0.0 ? uEyes.x : uEyes.y;
    float inner = vRest.x > 0.0 ? -en.x : en.x;
    float lidLine = mix(-1.05, 0.95, lid) - uBrowSlant * 0.35 * (inner + 0.2);
    float lower = mix(-1.0, -0.55, uEyes.w);
    float pd = dot(en, gz);
    float pupilR = mix(0.1, 0.42, uEyes.z);
    float iris = smoothstep(cos(pupilR + 0.17), cos(pupilR + 0.13), pd);
    float pupil = smoothstep(cos(pupilR), cos(pupilR - 0.04), pd);
#ifdef FILM
    vec3 sclera = vec3(0.86, 0.84, 0.5);
    vec3 irisC = vec3(0.42, 0.28, 0.04);
#else
    vec3 sclera = vec3(0.72, 0.7, 0.46) * (0.88 + 0.12 * sn3(vRest * 60.0));
    sclera = mix(sclera, vec3(0.6, 0.25, 0.2), smoothstep(0.55, 0.85, 1.0 - dot(en, normalize(vec3(sign(vRest.x) * 0.2, 0.0, 1.0)))) * 0.35);
    vec3 irisC = vec3(0.5, 0.36, 0.05);
#endif
    vec3 eye = mix(sclera, irisC, iris);
    eye = mix(eye, vec3(0.005), pupil);
    vec3 b = lightAll(N, V, eye, 0.1, 0.3, spec);
    col = b + eye * 0.16 * uGlow + spec * 3.0;
    float lidMask = smoothstep(lidLine - 0.04, lidLine + 0.04, en.y) + smoothstep(lower + 0.04, lower - 0.04, en.y);
    vec3 lidC = vec3(0.1, 0.36, 0.04) * (0.55 + 0.45 * uGlow);
    col = mix(col, lidC * (0.5 + 0.5 * NV) + spec * 0.5, clamp(lidMask, 0.0, 1.0));
    col *= 1.0 - 0.7 * smoothstep(0.09, 0.0, abs(en.y - lidLine)) * (1.0 - step(0.98, lid));
  } else if (mat == 3) {
    vec3 tooth = vec3(0.74, 0.7, 0.48) * (0.82 + 0.18 * sn3(vRest * 40.0));
    vec3 b = lightAll(N, V, tooth, 0.25, 0.4, spec);
    col = b + tooth * 0.1 * uGlow + spec * 1.4;
    col *= 0.6 + 0.4 * smoothstep(0.24, 0.33, vRest.z);
  } else if (mat == 2) {
#ifdef FILM
    vec3 tg = vec3(0.75, 0.22, 0.38);
#else
    vec3 tg = vec3(0.42, 0.1, 0.2) * (0.85 + 0.3 * sn3(vRest * 25.0));
#endif
    vec3 b = lightAll(N, V, tg, 0.16, 0.5, spec);
    col = b + tg * 0.12 * uGlow + spec * 2.2;
  } else if (mat == 1) {
    float depth = clamp((0.37 - vRest.z) / 0.16, 0.0, 1.0);
    vec3 m = mix(vec3(0.11, 0.012, 0.028), vec3(0.008, 0.0, 0.004), pow(depth, 0.7));
    col = m * (0.7 + 0.3 * uGlow) + lightAll(N, V, m, 0.3, 0.5, spec) * 0.3 + spec * 0.4 * (1.0 - depth);
  } else {
#ifdef FILM
    float n1 = vNz.w;
    vec3 base = mix(vec3(0.1, 0.42, 0.04), vec3(0.42, 0.85, 0.16), smoothstep(-0.35, 0.55, n1 * 0.6 + N.y * 0.45 + shadeY * 0.4));
    vec3 b = lightAll(N, V, base, 0.28, 0.6, spec);
    vec3 emis = mix(vec3(0.04, 0.2, 0.02), vec3(0.2, 0.44, 0.07), NV * NV) * (0.8 + 0.2 * sn3(vRest * 2.0 + tq * 0.6)) * uGlow;
    vec3 rim = vec3(0.22, 0.55, 0.11) * fres * uGlow;
    col = b * 0.9 + emis + rim + spec * 1.6;
    alpha = mix(0.84, 0.42, fres) * mix(1.0, 0.0, smoothstep(0.55, 1.0, vTail));
#else
    float n1 = vNz.x;
    float veins = vNz.y;
    float blot = vNz.z;
    vec3 base = mix(vec3(0.06, 0.22, 0.02), vec3(0.24, 0.52, 0.06), smoothstep(-0.5, 0.6, n1 * 0.6 + shadeY * 0.5));
    base = mix(base, vec3(0.42, 0.62, 0.12), blot * 0.15);
    base *= 1.0 - veins * 0.5;
    vec3 Np = N;
    vec3 b = lightAll(Np, V, base, 0.2, 0.75, spec);
    float inner = sn3(vRest * 3.0 + vec3(uTime * 0.25, -uTime * 0.4, uTime * 0.2)) * 0.5 + 0.5;
    float thick = pow(NV, 1.5);
    vec3 sss = mix(vec3(0.03, 0.16, 0.01), vec3(0.2, 0.46, 0.06), inner) * (0.25 + 0.75 * thick) * uGlow * (0.6 + 0.4 * shadeY);
    sss *= 1.0 - veins * 0.6;
    vec3 rim = vec3(0.22, 0.6, 0.12) * fres * uGlow;
    vec3 env = mix(vec3(0.01, 0.012, 0.025), vec3(0.12, 0.07, 0.035), smoothstep(-0.2, 0.3, -reflect(-V, Np).y)) * fres * 1.5;
    col = b + sss + rim + min(spec * 1.7, vec3(6.0)) + env;
    alpha = mix(0.97, 0.66, fres) * mix(1.0, 0.0, smoothstep(0.55, 1.0, vTail));
#endif
    float dl = length(vRest - ${glv(EYE_L)}) - ${EYE_RL.toFixed(4)}, dr = length(vRest - ${glv(EYE_R)}) - ${EYE_RR.toFixed(4)};
    float ao = 1.0 - 0.55 * smoothstep(0.05, 0.0, min(dl, dr));
    ao *= 1.0 - 0.5 * smoothstep(0.05, 0.0, abs(vRest.y + 0.035) - 0.06) * smoothstep(0.32, 0.22, abs(vRest.x)) * smoothstep(0.18, 0.3, vRest.z) * smoothstep(0.25, 0.4, length(vRest.xz));
    ao *= 1.0 - 0.35 * smoothstep(0.1, 0.0, abs(abs(vRest.x) - 0.33) - 0.02) * smoothstep(-0.25, -0.05, vRest.y) * smoothstep(0.05, -0.12, vRest.y);
    col *= ao;
    float cavD = sdEllA(vRest, vec3(0.0, -0.04, 0.3), vec3(0.27, 0.07, 0.2));
    float lip = smoothstep(0.075, 0.025, cavD) * smoothstep(0.17, 0.25, vRest.z) * step(abs(vRest.x), 0.34);
#ifdef FILM
    vec3 lipC = vec3(0.62, 0.5, 0.08) * (0.7 + 0.5 * uGlow);
#else
    vec3 lipC = vec3(0.42, 0.3, 0.05) * (0.6 + 0.4 * uGlow) + spec * 0.6;
#endif
    col = mix(col, lipC * (0.55 + 0.45 * NV) + spec * 0.5, lip * 0.85);
    float hit = exp(-dot(vRest - uHit.xyz, vRest - uHit.xyz) * 30.0) * uHit.w;
    col += vec3(1.0, 0.7, 0.3) * hit * 1.1;
  }
  float fl = 0.6 + 0.4 * sin(tq * 55.0);
  col += vec3(0.9, 1.0, 0.7) * uHurt * fl * 0.45;
  col *= uTint;
  float sk = clamp(uSuck * 1.4, 0.0, 1.0);
  col = mix(col, col * 1.25 + vec3(0.25, 0.35, 0.5) * 0.3, sk * 0.5);
  gl_FragColor = vec4(col * alpha * uOpacity, alpha * uOpacity);
}
`;

const SHELL_VS = /* glsl */`
${NOISE}
${DEFORM}
uniform float uShell;
varying vec3 vN;
varying vec3 vW;
varying float vTail;
varying vec3 vRest;
void main() {
  vec3 p = position;
  vec3 n = normal;
  deform(p, n);
  p += n * uShell * (1.0 + 0.25 * sn3(position * 4.0 + uTime * 0.7));
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vTail = aW1.z;
  vRest = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHELL_FS = /* glsl */`
uniform vec3 uShellCol;
uniform float uGlow;
uniform float uHurt;
uniform float uOpacity;
uniform float uShellPow;
varying vec3 vN;
varying vec3 vW;
varying float vTail;
varying vec3 vRest;
void main() {
  if (vRest.z > 0.12 && abs(vRest.x) < 0.34 && vRest.y < 0.1 && vRest.y > -0.2) discard;
  if (vRest.z > 0.22 && vRest.y > 0.08 && vRest.y < 0.3 && abs(vRest.x) < 0.25) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float d = clamp(-dot(N, V), 0.0, 1.0);
  float g = pow(smoothstep(0.0, 0.75, d), uShellPow) * (1.0 - smoothstep(0.6, 1.0, vTail) * 0.7);
  vec3 c = uShellCol * g * uGlow * uOpacity * (1.0 + uHurt * 1.5);
  gl_FragColor = vec4(c, 1.0);
}
`;

export const MOODS = {
  idle: { jaw: 0.22, smile: 0.35, browL: 0.1, browR: 0.0, slant: 0.0, lid: 0.82, pupil: 0.55, tongue: 0.2, wag: 0.1, armRaise: 0.15, armSwing: 0.2, flail: 0.15, puff: 0.0, glow: 1.0, wobble: 1.0, chomp: 0, tail: 0.06, tilt: 0.0, low: 0.0 },
  eat: { jaw: 0.55, smile: 0.5, browL: 0.35, browR: 0.3, slant: -0.1, lid: 0.55, pupil: 0.55, tongue: 0.55, wag: 0.35, armRaise: 0.45, armSwing: 0.9, flail: 0.25, puff: 0.7, glow: 1.1, wobble: 1.3, chomp: 1, tail: 0.08, tilt: 0.0, low: 0.3 },
  taunt: { jaw: 0.75, smile: 0.9, browL: 0.85, browR: -0.15, slant: 0.0, lid: 0.9, pupil: 0.5, tongue: 1.0, wag: 1.0, armRaise: 0.9, armSwing: 0.4, flail: 0.75, puff: 0.15, glow: 1.15, wobble: 1.2, chomp: 0, tail: 0.1, tilt: 0.22, low: 0.0 },
  angry: { jaw: 0.6, smile: -0.7, browL: -0.45, browR: -0.45, slant: 1.0, lid: 0.62, pupil: 0.32, tongue: 0.0, wag: 0.0, armRaise: 0.35, armSwing: 1.1, flail: 0.3, puff: 0.2, glow: 1.35, wobble: 1.8, chomp: 0, tail: 0.12, tilt: -0.08, low: 0.4 },
  flee: { jaw: 0.95, smile: -0.35, browL: 1.0, browR: 1.0, slant: -0.7, lid: 1.0, pupil: 0.18, tongue: 0.25, wag: 0.4, armRaise: 1.2, armSwing: -0.2, flail: 1.0, puff: 0.0, glow: 1.0, wobble: 1.5, chomp: 0, tail: 0.14, tilt: 0.0, low: 0.0 },
  hurt: { jaw: 0.8, smile: -0.85, browL: 0.4, browR: 0.4, slant: -0.4, lid: 0.12, pupil: 0.5, tongue: 0.75, wag: 0.6, armRaise: 0.9, armSwing: 0.5, flail: 0.9, puff: 0.0, glow: 1.6, wobble: 2.2, chomp: 0, tail: 0.16, tilt: 0.1, low: 0.0 },
  wrangled: { jaw: 0.65, smile: -0.55, browL: -0.1, browR: 0.2, slant: 0.65, lid: 0.32, pupil: 0.45, tongue: 0.35, wag: 0.8, armRaise: 1.0, armSwing: 0.6, flail: 1.0, puff: 0.0, glow: 1.35, wobble: 2.4, chomp: 0, tail: 0.2, tilt: 0.0, low: 0.0 },
  sucked: { jaw: 1.0, smile: -0.6, browL: 1.0, browR: 1.0, slant: -0.8, lid: 1.0, pupil: 0.16, tongue: 0.55, wag: 1.0, armRaise: 1.4, armSwing: -0.3, flail: 1.0, puff: 0.0, glow: 1.5, wobble: 2.0, chomp: 0, tail: 0.25, tilt: 0.0, low: 0.0 },
};
const KEYS = Object.keys(MOODS.idle);

function bodyUniforms(fx, shared) {
  return {
    ...shared,
    uTimeQ: fx.U.uTimeQ,
    uGlow: { value: 1 }, uHurt: { value: 0 }, uHit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uEyes: { value: new THREE.Vector4(0.8, 0.8, 0.5, 0) }, uGazeL: { value: new THREE.Vector3(0, 0, 1) }, uGazeR: { value: new THREE.Vector3(0, 0, 1) },
    uBrowSlant: { value: 0 }, uKeyDir: fx.U.uKeyDir, uKeyCol: fx.U.uKeyCol, uAmb: fx.U.uAmb,
    uLPos: fx.U.uLPos, uLCol: fx.U.uLCol, uOpacity: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSelf: { value: new THREE.Vector3() },
  };
}

export class Ghost {
  constructor(fx, geometry) {
    this.fx = fx;
    this.object3D = new THREE.Group();
    this.object3D.name = 'Onionhead';
    this.radius = 0.58;
    this.S = {
      uTime: fx.U.uTime, uJaw: { value: 0.2 }, uSmile: { value: 0.3 }, uBrow: { value: new THREE.Vector4() }, uTongue: { value: new THREE.Vector4() },
      uArmL: { value: new THREE.Vector4() }, uArmR: { value: new THREE.Vector4() }, uTail: { value: new THREE.Vector4(0.05, 0.03, 0, 0) },
      uPuff: { value: 0 }, uStretch: { value: new THREE.Vector4(0, 1, 0, 1) }, uJiggle: { value: new THREE.Vector3() }, uWobble: { value: 1 },
      uStruggle: { value: 0 }, uSuck: { value: 0 }, uTrap: { value: new THREE.Vector3(0, -1, 0) }, uSquash: { value: 0 }, uBump: { value: 1 },
    };
    const bu = bodyUniforms(fx, this.S);
    this.BU = bu;
    const mk = (film) => new THREE.ShaderMaterial({
      vertexShader: BODY_VS, fragmentShader: BODY_FS, uniforms: bu, defines: film ? { FILM: '' } : {},
      transparent: true, depthWrite: true, depthTest: true, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mats = { modern: mk(false), film: mk(true) };
    const su = { ...this.S, uShell: { value: 0.05 }, uShellCol: { value: new THREE.Color(0.25, 0.9, 0.18) }, uShellPow: { value: 1.6 }, uGlow: bu.uGlow, uHurt: bu.uHurt, uOpacity: bu.uOpacity };
    this.SU = su;
    const sm = new THREE.ShaderMaterial({
      vertexShader: SHELL_VS, fragmentShader: SHELL_FS, uniforms: su,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.shellMat = sm;
    this.body = new THREE.Mesh(geometry, this.mats.modern);
    this.body.renderOrder = 20;
    this.body.frustumCulled = false;
    this.shell = new THREE.Mesh(geometry, sm);
    this.shell.renderOrder = 21;
    this.shell.frustumCulled = false;
    this.object3D.add(this.body, this.shell);
    this.e = {};
    for (const k of KEYS) this.e[k] = MOODS.idle[k];
    this.mood = 'idle';
    this.t = 0;
    this.blink = 0;
    this.nextBlink = 2;
    this.gaze = new THREE.Vector3(0, 0, 1);
    this.gazeT = new THREE.Vector3(0, 0, 1);
    this.saccade = 0;
    this.vel = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.jig = new THREE.Vector3();
    this.jigV = new THREE.Vector3();
    this.hitAmt = 0;
    this.flinch = 0;
    this.prevHurt = 0;
    this.suckHid = false;
    this.drip = 0;
    this.wisp = 0;
    this.tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Matrix4()];
    this.setStyle(fx.style);
  }

  setStyle(style) {
    this.style = style;
    this.body.material = this.mats[style] || this.mats.modern;
    const film = style === 'film';
    this.SU.uShell.value = film ? 0.11 : 0.045;
    this.SU.uShellCol.value.setRGB(film ? 0.12 : 0.05, film ? 0.48 : 0.24, film ? 0.08 : 0.04);
    this.SU.uShellPow.value = film ? 1.1 : 1.8;
    this.S.uBump.value = film ? 0.3 : 1.0;
  }

  hit(localPoint, amount = 1) {
    this.BU.uHit.value.set(localPoint.x, localPoint.y, localPoint.z, Math.min(1.5, this.BU.uHit.value.w + amount));
  }

  update(dt, p = {}) {
    const fx = this.fx, e = this.e, S = this.S, BU = this.BU;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.t += dt;
    const t = this.t;
    const moodName = p.mood && MOODS[p.mood] ? p.mood : 'idle';
    this.mood = moodName;
    const M = MOODS[moodName];
    const k = 1 - Math.exp(-dt * (moodName === 'hurt' ? 18 : 7));
    for (let i = 0; i < KEYS.length; i++) { const key = KEYS[i]; e[key] += (M[key] - e[key]) * k; }

    const hurt = clamp(p.hurt || 0, 0, 1);
    if (hurt > this.prevHurt + 0.15) this.flinch = 1;
    this.prevHurt = hurt;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    let struggle = 0;
    const sv = this.tmp[0];
    if (p.struggle && typeof p.struggle === 'object') { struggle = Math.min(1, p.struggle.length()); sv.copy(p.struggle); }
    else { struggle = clamp(+p.struggle || 0, 0, 1); sv.set(0, 0, 0); }
    if (moodName === 'wrangled') struggle = Math.max(struggle, 0.35);
    fx._struggle = struggle;
    const suck = clamp(p.suck || 0, 0, 1);
    const mouth = clamp(p.mouth || 0, 0, 1);

    let jaw = Math.max(e.jaw, mouth);
    if (e.chomp > 0.05) jaw = lerp(jaw, 0.08 + 0.92 * Math.pow(0.5 + 0.5 * Math.sin(t * 11), 1.5), e.chomp);
    if (moodName === 'taunt') jaw += Math.sin(t * 7) * 0.08;
    S.uJaw.value = jaw * 0.62;
    S.uSmile.value = e.smile;
    const flail = e.flail;
    const fa = Math.sin(t * 9.5) * flail, fb = Math.sin(t * 8.3 + 1.7) * flail;
    S.uBrow.value.set(e.browL + Math.sin(t * 3.1) * 0.05, e.browR + Math.sin(t * 2.7) * 0.05, e.slant, 0);
    BU.uBrowSlant.value = e.slant;
    S.uTongue.value.set(clamp(e.tongue, 0, 1), e.wag, moodName === 'taunt' ? 0.6 : 0, 0);
    S.uArmL.value.set(e.armRaise * 0.9 + fa * 0.7 + Math.sin(t * 1.3) * 0.08, e.armSwing * 0.6 + fb * 0.4, Math.sin(t * 2.1) * 0.15 * flail, 0);
    S.uArmR.value.set(e.armRaise * 0.9 - fb * 0.7 + Math.sin(t * 1.2 + 2) * 0.08, e.armSwing * 0.6 + fa * 0.4, Math.sin(t * 1.9) * 0.15 * flail, 0);
    S.uPuff.value = e.puff * (0.75 + 0.25 * Math.sin(t * 11));
    S.uWobble.value = e.wobble + struggle * 1.5;
    S.uStruggle.value = struggle;
    S.uSquash.value = this.flinch * 0.9 + (moodName === 'eat' ? Math.max(0, Math.sin(t * 11)) * 0.12 : 0);

    const v = this.vel;
    if (p.vel) v.copy(p.vel); else v.set(0, 0, 0);
    const inv = this.tmp[3].copy(this.object3D.getWorldQuaternion(this.tmp[3])).invert();
    const lv = this.tmp[1].copy(v).applyQuaternion(inv);
    const sp = lv.length();
    let stretch = 1 + Math.min(0.42, sp * 0.045) + struggle * 0.12 * Math.abs(Math.sin(t * 13));
    if (sp > 0.05) lv.multiplyScalar(1 / sp); else lv.set(0, 1, 0);
    if (struggle > 0.01 && sv.lengthSq() > 1e-6) {
      const ls = this.tmp[2].copy(sv).applyQuaternion(inv).normalize();
      lv.lerp(ls, clamp(struggle / (struggle + sp * 0.1 + 0.01), 0, 1)).normalize();
    }
    S.uStretch.value.set(lv.x, lv.y, lv.z, stretch);
    const acc = this.tmp[2].copy(v).sub(this.prevVel).multiplyScalar(dt > 0 ? 1 / dt : 0);
    this.prevVel.copy(v);
    acc.applyQuaternion(inv).clampLength(0, 60);
    this.jigV.addScaledVector(acc, -0.3 * dt);
    this.jigV.addScaledVector(this.jig, -60 * dt);
    this.jigV.multiplyScalar(Math.max(0, 1 - 4.6 * dt));
    this.jig.addScaledVector(this.jigV, dt);
    this.jig.clampLength(0, 0.12);
    S.uJiggle.value.copy(this.jig);
    S.uTail.value.set(e.tail + sp * 0.01 + struggle * 0.1, e.tail * 0.6 + struggle * 0.06, 0, -Math.min(0.25, sp * 0.03));

    S.uSuck.value = suck;
    if (p.trapPos && suck > 0) {
      const tl = this.tmp[0].copy(p.trapPos);
      this.body.updateWorldMatrix(true, false);
      this.body.worldToLocal(tl);
      S.uTrap.value.copy(tl);
    }
    if (suck >= 0.995) { if (this.object3D.visible) { this.object3D.visible = false; this.suckHid = true; } }
    else if (this.suckHid) { this.object3D.visible = true; this.suckHid = false; }

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = fx.rng.range(1.8, 4.5); }
    this.blink = Math.max(0, this.blink - dt * 7);
    const bl = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    let lid = e.lid * (1 - bl);
    if (moodName === 'hurt') lid *= 0.4 + 0.6 * Math.max(0, Math.sin(t * 13));
    const lidL = clamp(lid + (moodName === 'taunt' ? 0.1 : 0), 0, 1), lidR = clamp(lid - (moodName === 'taunt' ? 0.25 : 0), 0, 1);
    BU.uEyes.value.set(lidL, lidR, e.pupil, moodName === 'eat' || moodName === 'hurt' || moodName === 'wrangled' ? 0.6 : 0.1);

    this.saccade -= dt;
    const cam = fx.camera;
    if (this.saccade <= 0) {
      this.saccade = fx.rng.range(0.4, 1.6);
      const gz = this.gazeT;
      if (cam && moodName !== 'flee' && moodName !== 'sucked') {
        cam.getWorldPosition(gz);
        this.object3D.worldToLocal(gz);
        gz.normalize();
        gz.x += fx.rng.signed() * 0.15; gz.y += fx.rng.signed() * 0.1;
      } else if (moodName === 'sucked') gz.set(fx.rng.signed() * 0.2, 0.6, 0.8);
      else gz.set(fx.rng.signed() * 0.8, fx.rng.signed() * 0.3, 0.5);
      gz.normalize();
      if (gz.z < 0.25) { gz.z = 0.25; gz.normalize(); }
    }
    this.gaze.lerp(this.gazeT, 1 - Math.exp(-dt * 25)).normalize();
    BU.uGazeL.value.copy(this.gaze).add(this.tmp[0].set(-0.06, 0, 0)).normalize();
    BU.uGazeR.value.copy(this.gaze).add(this.tmp[0].set(0.06, 0, 0)).normalize();

    BU.uGlow.value = e.glow * (1 + 0.06 * Math.sin(t * 3.3)) * (1 + suck * 0.5);
    BU.uHurt.value = hurt;
    const hw = BU.uHit.value.w;
    BU.uHit.value.w = Math.max(0, hw - dt * 2.5);
    const tilt = e.tilt;
    this.body.rotation.z = Math.sin(t * 0.9) * 0.04 + tilt * Math.sin(t * 2.2);
    this.body.rotation.x = e.low * 0.12;
    this.shell.rotation.copy(this.body.rotation);
    const bob = Math.sin(t * 1.8) * 0.035 + Math.sin(t * 3.1) * 0.012;
    this.body.position.y = bob;
    this.shell.position.y = bob;

    this.effects(dt, sp, struggle, suck);
    const G = this.tmp[0];
    this.object3D.getWorldPosition(G);
    BU.uSelf.value.copy(G);
    const film = this.style === 'film';
    fx.lightPool.request(G, 0.35, 1.0, 0.25, (film ? 2.4 : 1.9) * e.glow * (1 + hurt * 0.6) * (1 - suck * 0.5), 2, 6);
  }

  effects(dt, sp, struggle, suck) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.tmp[1];
    const film = this.style === 'film';
    this.wisp += dt * (film ? 6 : 16) * (1 + sp * 0.1 + struggle);
    while (this.wisp >= 1) {
      this.wisp -= 1;
      W.set(r.signed() * 0.25 + 0.2, -0.55 + r.signed() * 0.1, -0.45 + r.signed() * 0.1);
      this.object3D.localToWorld(W);
      P.motes.emit(W.x, W.y, W.z, r.signed() * 0.15, r.range(-0.05, 0.2), r.signed() * 0.15, r.range(0.8, 1.8), r.range(0.02, 0.05), r.next(), 1.5, -0.02, -1e3, 2, 1, r.signed());
    }
    this.drip += dt * (this.mood === 'eat' ? 2.5 : 0.5) * (1 + struggle * 3);
    while (this.drip >= 1) {
      this.drip -= 1;
      W.set(r.signed() * 0.25, -0.18 + r.signed() * 0.05, 0.3);
      this.object3D.localToWorld(W);
      P.slime.emit(W.x, W.y, W.z, r.signed() * 0.3, -0.2, r.signed() * 0.3, r.range(0.8, 1.6), r.range(0.015, 0.028), r.next(), 0.4, 1, fx.groundY, 0, 0, 0);
    }
  }
}
