// FX composer passes (linear HDR, after bloom, before the final grade): heat haze, lens slime, 1984 film grade.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NOISE, FULLSCREEN_VERT } from './glsl.js';

const HAZE = {
  uniforms: {
    tDiffuse: { value: null }, uNoise: { value: null }, uTime: { value: 0 }, uAspect: { value: 1.78 },
    uSeg: { value: new Float32Array(16 * 4) }, uRad: { value: new Float32Array(16 * 2) }, uCount: { value: 0 }, uAmt: { value: 1 },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D uNoise;
    uniform float uTime;
    uniform float uAspect;
    uniform vec4 uSeg[16];
    uniform vec2 uRad[16];
    uniform int uCount;
    uniform float uAmt;
    varying vec2 vUv;
    void main() {
      vec2 p = vec2(vUv.x * uAspect, vUv.y);
      float m = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= uCount) break;
        vec4 s = uSeg[i];
        vec2 a = vec2(s.x * uAspect, s.y), b = vec2(s.z * uAspect, s.w);
        vec2 ab = b - a;
        float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
        float d = length(p - a - ab * t);
        float r = uRad[i].x;
        m = max(m, uRad[i].y * smoothstep(r, r * 0.15, d));
      }
      vec2 uv = vUv;
      if (m > 0.001) {
        vec2 q = vec2(vUv.x * uAspect * 7.0, vUv.y * 7.0 - uTime * 1.6);
        vec2 n = vec2(texture2D(uNoise, q * 0.11).r, texture2D(uNoise, q * 0.11 + 0.37).g) - 0.5;
        vec2 n2 = vec2(texture2D(uNoise, q * 0.31 + vec2(0.0, -uTime * 0.2)).b, texture2D(uNoise, q * 0.29 + 0.61).a) - 0.5;
        uv += (n * 0.006 + n2 * 0.003) * m * uAmt;
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

const SLIME = {
  uniforms: {
    tDiffuse: { value: null }, uLens: { value: null }, uAmt: { value: 0 }, uAge: { value: 0 }, uOff: { value: new THREE.Vector2() },
    uRot: { value: 0 }, uAspect: { value: 1.78 }, uFilm: { value: 0 }, uScale: { value: 1 },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D uLens;
    uniform float uAmt;
    uniform float uAge;
    uniform vec2 uOff;
    uniform float uRot;
    uniform float uAspect;
    uniform float uFilm;
    uniform float uScale;
    varying vec2 vUv;
    vec4 lens(vec2 uv) {
      vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) / uScale;
      float c = cos(uRot), s = sin(uRot);
      p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
      vec2 q = p * 0.5 + 0.5 + uOff;
      float drip = texture2D(uLens, q).a;
      q.y += uAge * 0.035 * (0.4 + 0.6 * drip);
      return texture2D(uLens, q);
    }
    void main() {
      vec4 L = lens(vUv);
      float hx = dFdx(L.g) * 2.0, hy = dFdy(L.g) * 2.0;
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmt < 0.002) { gl_FragColor = base; return; }
      float cov = smoothstep(0.15, 0.6, L.r * clamp(uAmt * 1.4, 0.0, 1.0) - (1.0 - clamp(uAmt, 0.0, 1.0)) * 0.35);
      if (cov < 0.001) { gl_FragColor = base; return; }
      vec2 refr = vec2(hx, hy) * 3.0 + (L.g - 0.5) * 0.02;
      vec3 bg = texture2D(tDiffuse, vUv - refr).rgb;
      vec3 bl = texture2D(tDiffuse, vUv - refr * 1.6 + vec2(0.003, -0.002)).rgb;
      vec3 tint = mix(vec3(0.42, 0.95, 0.25), vec3(0.6, 1.0, 0.3), uFilm);
      vec3 goo = mix(bg, bl, 0.5) * tint * (0.75 + 0.25 * L.b);
      float th = L.g;
      goo = mix(goo, vec3(0.06, 0.32, 0.03), th * 0.55);
      goo += tint * (0.035 + 0.05 * uFilm) * th;
      vec3 nrm = normalize(vec3(-hx * 60.0, -hy * 60.0, 1.0));
      float spec = pow(max(dot(nrm, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 40.0);
      goo += vec3(0.9, 1.0, 0.85) * spec * 1.4;
      float edge = smoothstep(0.0, 0.25, cov) * (1.0 - smoothstep(0.25, 0.7, cov));
      goo *= 1.0 - edge * 0.45;
      gl_FragColor = vec4(mix(base.rgb, goo, cov), 1.0);
    }
  `,
};

const FILM = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uWeave: { value: new THREE.Vector2() },
    uGrain: { value: 0.08 }, uHal: { value: 0.18 }, uSoft: { value: 0.3 }, uFlick: { value: 0 }, uVig: { value: 0.25 }, uFrame: { value: 0 },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */`
    ${NOISE}
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform vec2 uWeave;
    uniform float uGrain;
    uniform float uHal;
    uniform float uSoft;
    uniform float uFlick;
    uniform float uVig;
    uniform float uFrame;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv + uWeave;
      vec2 px = 1.0 / uRes;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      vec3 s1 = texture2D(tDiffuse, uv + px * vec2(0.5, 0.5)).rgb + texture2D(tDiffuse, uv - px * vec2(0.5, 0.5)).rgb;
      c = mix(c, s1 * 0.5, uSoft);
      vec3 hsum = max(texture2D(tDiffuse, uv + px * vec2(6.5, 2.5)).rgb - 1.5, 0.0) + max(texture2D(tDiffuse, uv + px * vec2(-2.5, 6.5)).rgb - 1.5, 0.0)
        + max(texture2D(tDiffuse, uv + px * vec2(-6.5, -2.5)).rgb - 1.5, 0.0) + max(texture2D(tDiffuse, uv + px * vec2(2.5, -6.5)).rgb - 1.5, 0.0);
      float hl = dot(hsum, vec3(0.3, 0.5, 0.2)) * 0.25;
      c += vec3(1.0, 0.28, 0.12) * hl * uHal;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.06);
      c = c * vec3(1.03, 0.995, 0.95) + vec3(0.004, 0.0035, 0.006);
      c *= 1.0 + uFlick;
      vec2 gp = floor(vUv * uRes / 1.35);
      float g1 = h21(gp + uFrame * 17.31) - 0.5;
      float g2 = h21(gp * 0.5 + uFrame * 7.77 + 3.1) - 0.5;
      float gr = (g1 * 0.7 + g2 * 0.5);
      float lum = clamp(l, 0.0, 2.0);
      float gw = uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.25, lum)) * (1.0 - smoothstep(0.6, 2.0, lum) * 0.6);
      c *= 1.0 + gr * gw * 2.2;
      c += gr * gw * 0.012;
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVig * smoothstep(0.2, 0.75, dot(d, d) * 2.2);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};

export class PostFX {
  constructor(fx) {
    this.fx = fx;
    this.haze = new ShaderPass(HAZE);
    this.haze.uniforms.uNoise.value = fx.tex.noise;
    this.haze.uniforms.uSeg.value = new Float32Array(16 * 4);
    this.haze.uniforms.uRad.value = new Float32Array(16 * 2);
    this.slime = new ShaderPass(SLIME);
    this.slime.uniforms.uLens.value = fx.tex.lens;
    this.film = new ShaderPass(FILM);
    this.list = [{ name: 'fxHaze', pass: this.haze }, { name: 'fxSlime', pass: this.slime }, { name: 'fxFilm', pass: this.film }];
    this.slimeAmt = 0;
    this.slimeAge = 0;
    this.size = new THREE.Vector2(1920, 1080);
    this.tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.setStyle(fx.style);
  }

  setStyle(style) {
    this.style = style;
    const film = style === 'film';
    this.film.enabled = film;
    this.slime.uniforms.uFilm.value = film ? 1 : 0;
    this.haze.uniforms.uAmt.value = film ? 0.0 : 1.0;
  }

  splat(amount) {
    const r = this.fx.rng;
    if (this.slimeAmt < 0.25 || amount > 0.3) {
      this.slime.uniforms.uOff.value.set(r.signed() * 0.15, r.signed() * 0.1);
      this.slime.uniforms.uRot.value = r.signed() * 0.6;
      this.slime.uniforms.uScale.value = 0.9 + r.next() * 0.35;
      this.slimeAge = 0;
    }
    this.slimeAmt = Math.min(1.25, this.slimeAmt + amount);
  }

  update(dt, streams) {
    const fx = this.fx, r = fx.renderer;
    r.getDrawingBufferSize(this.size);
    const aspect = this.size.x / Math.max(1, this.size.y);
    this.slimeAmt = Math.max(0, this.slimeAmt - dt * (this.slimeAmt > 0.7 ? 0.12 : 0.26));
    this.slimeAge += dt;
    const su = this.slime.uniforms;
    su.uAmt.value = this.slimeAmt;
    su.uAge.value = this.slimeAge;
    su.uAspect.value = aspect;
    this.slime.enabled = this.slimeAmt > 0.002;

    const hu = this.haze.uniforms;
    hu.uTime.value = fx.time;
    hu.uAspect.value = aspect;
    let n = 0;
    const cam = fx.camera, A = this.tmp[0], B = this.tmp[1], C = this.tmp[2];
    if (this.style !== 'film' && fx.quality.haze && cam) {
      const fovK = 1 / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 55) * 0.5));
      cam.getWorldPosition(C);
      for (let si = 0; si < streams.length; si++) {
        const s = streams[si];
        if (!s.groups.modern.visible || s.U.uIntensity.value < 0.05) continue;
        let prevOk = false;
        for (let i = 0; i <= 8 && n < 15; i++) {
          s.pathPoint(i / 8, B);
          const depth = B.distanceTo(C);
          A.copy(B).project(cam);
          const ok = A.z < 1 && A.z > -1;
          if (ok && prevOk) {
            hu.uSeg.value[n * 4 + 2] = A.x * 0.5 + 0.5; hu.uSeg.value[n * 4 + 3] = A.y * 0.5 + 0.5;
            hu.uRad.value[n * 2] = Math.min(0.25, 0.16 * fovK / Math.max(depth, 0.3)); hu.uRad.value[n * 2 + 1] = 0.9 * s.U.uIntensity.value;
            n++;
          }
          if (ok && n < 15) { hu.uSeg.value[n * 4] = A.x * 0.5 + 0.5; hu.uSeg.value[n * 4 + 1] = A.y * 0.5 + 0.5; }
          prevOk = ok;
        }
        if (s.kind === 1 && s.head >= 1 && n < 16) {
          B.copy(s.end).addScaledVector(s.endN, 0.25);
          A.copy(B).project(cam);
          if (A.z < 1 && A.z > -1) {
            const x = A.x * 0.5 + 0.5, y = A.y * 0.5 + 0.5;
            const depth = B.distanceTo(C);
            hu.uSeg.value[n * 4] = x; hu.uSeg.value[n * 4 + 1] = y; hu.uSeg.value[n * 4 + 2] = x; hu.uSeg.value[n * 4 + 3] = y + Math.min(0.3, 0.9 * fovK / Math.max(depth, 0.5));
            hu.uRad.value[n * 2] = Math.min(0.3, 0.45 * fovK / Math.max(depth, 0.5)); hu.uRad.value[n * 2 + 1] = 1.2 * s.U.uIntensity.value;
            n++;
          }
        }
      }
    }
    hu.uCount.value = n;
    this.haze.enabled = n > 0;

    const fu = this.film.uniforms;
    const frame = Math.floor(fx.time * 24);
    fu.uFrame.value = frame % 997;
    fu.uTime.value = fx.time;
    fu.uRes.value.copy(this.size);
    const wx = (Math.sin(frame * 0.71) * 0.6 + Math.sin(frame * 1.93) * 0.4) * 0.00035;
    const wy = (Math.sin(frame * 0.53 + 1.0) * 0.6 + Math.sin(frame * 2.71) * 0.4) * 0.0005;
    fu.uWeave.value.set(wx, wy);
    fu.uFlick.value = Math.sin(frame * 12.9898) * 0.012;
  }
}
