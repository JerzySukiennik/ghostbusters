// Fallback copy of the game's HDR pipeline (scene, NaN guard, bloom 0.55/0.5/1.0, FX passes, ACES final) used only if src/engine/renderer.js fails to load.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const PRESETS = {
  low: { pr: 0.7, msaa: 0 },
  medium: { pr: 0.85, msaa: 2 },
  high: { pr: 1.0, msaa: 4 },
};
const Q = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const SANITIZE = {
  uniforms: { tDiffuse: { value: null } }, vertexShader: Q,
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(clamp(c.rgb, 0.0, 64.0), 1.0); }',
};
const FINAL = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: Q,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) { const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c = IN * (c / 0.6); c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() { vec2 d = vUv - 0.5; float r2 = dot(d, d); vec3 col = aces(texture2D(tDiffuse, vUv).rgb);
      col *= 1.0 - 0.42 * smoothstep(0.1, 0.7, r2 * 1.6); col = toSRGB(col);
      col += (hash(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7) - 0.5) * 0.016; gl_FragColor = vec4(col, 1.0); }`,
};

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);
    this.preset = PRESETS.medium;
    this.extra = [];
    addEventListener('resize', () => this.resize());
  }
  setPreset(name) { this.preset = PRESETS[name] || PRESETS.medium; if (this.scene) this.rebuild(); }
  build(scene, camera) { this.scene = scene; this.camera = camera; this.rebuild(); }
  setExtraPasses(list) { this.extra = list || []; if (this.composer) this.rebuild(); }
  rebuild() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: this.preset.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(SANITIZE));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 1.0));
    for (const e of this.extra) if (e && e.pass) this.composer.addPass(e.pass);
    this.final = new ShaderPass(FINAL);
    this.composer.addPass(this.final);
    this.resize();
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.preset.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.final.uniforms.uRes.value.set(w * pr, h * pr); }
  }
  render(time, dt) { this.final.uniforms.uTime.value = time; this.composer.render(dt); }
}
