// HDR pipeline: scene -> NaN guard -> bloom -> FX passes -> ACES filmic grade with shake, flash, vignette and grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const PRESETS = {
  low: { name: 'low', pr: 0.7, shadow: 1024, msaa: 0, bloom: true, shadows: true },
  medium: { name: 'medium', pr: 0.85, shadow: 2048, msaa: 2, bloom: true, shadows: true },
  high: { name: 'high', pr: 1.0, shadow: 2048, msaa: 4, bloom: true, shadows: true },
};

const Q = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: Q,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float fixf(float x) {
      uint b = floatBitsToUint(x);
      if ((b & 0x7f800000u) == 0x7f800000u) return (b & 0x007fffffu) == 0u ? (x > 0.0 ? 64.0 : 0.0) : 0.0;
      return clamp(x, 0.0, 64.0);
    }
    void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(fixf(c.r), fixf(c.g), fixf(c.b), 1.0); }
  `,
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.016 },
    uCA: { value: 0.0016 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1.0, 0.97, 0.9) },
    uShake: { value: new THREE.Vector2() },
    uSat: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
  },
  vertexShader: Q,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uVignette, uGrain, uCA, uFlash, uSat;
    uniform vec2 uRes, uShake;
    uniform vec3 uFlashColor, uLift;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) {
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c = IN * (c / 0.6); c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv + uShake;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uCA * (0.3 + r2 * 2.5);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col *= uExposure;
      col += uFlashColor * uFlash * 3.0;
      col = aces(col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat) + uLift * (1.0 - l);
      col *= 1.0 - uVignette * smoothstep(0.1, 0.7, r2 * 1.6);
      col = toSRGB(col);
      col += (hash(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.preset = PRESETS.medium;
    this.extra = [];
    this.shake = new THREE.Vector2();
    this.trauma = 0;
    this.flash = 0;
    this.onPreset = [];
    addEventListener('resize', () => this.resize());
  }

  get canvas() { return this.renderer.domElement; }

  build(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.rebuild();
  }

  setExtraPasses(list) { this.extra = list || []; if (this.composer) this.rebuild(); }

  rebuild() {
    const p = this.preset;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: p.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 1.0);
    this.bloom.enabled = p.bloom;
    this.composer.addPass(this.bloom);
    for (const e of this.extra) if (e && e.pass) this.composer.addPass(e.pass);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.renderer.shadowMap.enabled = p.shadows;
    this.resize();
  }

  setPreset(name) {
    const p = PRESETS[name] || PRESETS.medium;
    if (p === this.preset) return;
    this.preset = p;
    if (this.scene) { this.rebuild(); for (const f of this.onPreset) f(p); }
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.preset.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.final.uniforms.uRes.value.set(w * pr, h * pr);
    }
  }

  addTrauma(t) { this.trauma = Math.min(1, this.trauma + t); }
  hitStop(t, s = 0.08) { this.hs = Math.max(this.hs || 0, t); this.hsScale = s; }
  timeScale(dt) { if (this.hs > 0) { this.hs -= dt; return this.hsScale; } return 1; }
  addFlash(f) { this.flash = Math.min(1.5, this.flash + f); }

  render(time, dt) {
    this.renderer.info.reset();
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    const s = this.trauma * this.trauma * 0.012;
    this.shake.set((Math.sin(time * 61.3) + Math.sin(time * 23.1) * 0.6) * s, (Math.cos(time * 57.9) + Math.sin(time * 31.7) * 0.6) * s);
    const u = this.final.uniforms;
    u.uTime.value = time;
    u.uShake.value.copy(this.shake);
    u.uFlash.value = this.flash;
    this.composer.render(dt);
  }
}
