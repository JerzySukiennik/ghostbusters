// FX composer passes (linear HDR, after bloom, before the final grade): lens slime and the 1984 film grade.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NOISE, FULLSCREEN_VERT } from './glsl.js';

const SLIME = {
  uniforms: {
    tDiffuse: { value: null }, uLens: { value: null }, uAmt: { value: 0 }, uAge: { value: 0 }, uOff: { value: new THREE.Vector2() },
    uRot: { value: 0 }, uAspect: { value: 1.78 }, uScale: { value: 1 },
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
      vec3 tint = vec3(0.6, 1.0, 0.3);
      vec3 goo = mix(bg, bl, 0.5) * tint * (0.75 + 0.25 * L.b);
      float th = L.g;
      goo = mix(goo, vec3(0.06, 0.32, 0.03), th * 0.55);
      goo += tint * 0.085 * th;
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
    this.slime = new ShaderPass(SLIME);
    this.slime.uniforms.uLens.value = fx.tex.lens;
    this.slime.enabled = false;
    this.film = new ShaderPass(FILM);
    this.list = [{ name: 'fxSlime', pass: this.slime }, { name: 'fxFilm', pass: this.film }];
    this.slimeAmt = 0;
    this.slimeAge = 0;
    this.size = new THREE.Vector2(1920, 1080);
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

  update(dt) {
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
