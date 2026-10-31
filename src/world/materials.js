// Shared texture loading and shader patching: analytic sodium lamps (same maths as three's SpotLight), world-space varyings.
export const LAMP_SLOTS = 16;

export function createTextures(THREE, renderer, base) {
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const pending = [];
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function tex(name, { srgb = false, repeat = null, wrap = true, flipY = true } = {}) {
    const key = name + (srgb ? ':s' : ':l');
    if (cache.has(key)) return cache.get(key);
    const t = new THREE.Texture();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.flipY = flipY;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    pending.push(new Promise((res, rej) => loader.load(base + name, (img) => {
      t.image = img.image;
      t.needsUpdate = true;
      res();
    }, undefined, rej)));
    cache.set(key, t);
    return t;
  }
  function set(prefix, opts = {}) {
    return {
      map: tex(`tex/${prefix}_diff.jpg`, { srgb: true, ...opts }),
      arm: tex(`tex/${prefix}_arm.jpg`, opts),
      nor: tex(`tex/${prefix}_nor.png`, opts),
    };
  }
  return { tex, set, ready: () => Promise.all(pending), cache };
}

export function createLampUniforms(THREE) {
  const mk = () => Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4());
  return {
    count: 0,
    uLampPos: { value: mk() },
    uLampDir: { value: mk() },
    uLampCol: { value: mk() },
    uLampFill: { value: mk() },
    uPlateTime: { value: 0 },
  };
}

const LAMP_PARS = /* glsl */`
uniform vec4 uLampPos[${LAMP_SLOTS}];
uniform vec4 uLampDir[${LAMP_SLOTS}];
uniform vec4 uLampCol[${LAMP_SLOTS}];
uniform vec4 uLampFill[${LAMP_SLOTS}];
uniform float uPlateTime;
`;

const LAMP_LOOP = /* glsl */`
#if defined( RE_Direct ) && defined( PLATE_LAMPS )
{
  for ( int li = 0; li < PLATE_LAMPS; li ++ ) {
    vec4 lp = uLampPos[ li ];
    vec3 lpv = ( viewMatrix * vec4( lp.xyz, 1.0 ) ).xyz;
    vec3 lvec = lpv - geometryPosition;
    float ldist = length( lvec );
    if ( ldist > lp.w ) continue;
    vec3 L = lvec / ldist;
    float latt = getDistanceAttenuation( ldist, lp.w, 2.0 );
    vec4 lf = uLampFill[ li ];
    #if defined( RE_IndirectDiffuse )
    irradiance += lf.rgb * latt * ( 0.35 + 0.65 * saturate( dot( geometryNormal, L ) * 0.5 + 0.5 ) );
    #endif
    vec4 ld = uLampDir[ li ];
    vec3 axis = normalize( ( viewMatrix * vec4( ld.xyz, 0.0 ) ).xyz );
    float sp = getSpotAttenuation( ld.w, uLampCol[ li ].a, dot( L, axis ) );
    if ( sp <= 0.0 ) continue;
    directLight.direction = L;
    directLight.color = uLampCol[ li ].rgb * ( sp * latt );
    directLight.visible = true;
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  }
}
#endif
`;

export function patchMaterial(material, opts = {}) {
  const { lamps = null, world = false, uniforms = {}, vertexPars = '', vertexMain = '', fragPars = '', frag = [], vert = [], key = '' } = opts;
  material.defines = material.defines || {};
  if (lamps) material.defines.PLATE_LAMPS = lamps.count;
  material.userData.plateUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    if (lamps) {
      shader.uniforms.uLampPos = lamps.uLampPos;
      shader.uniforms.uLampDir = lamps.uLampDir;
      shader.uniforms.uLampCol = lamps.uLampCol;
      shader.uniforms.uLampFill = lamps.uLampFill;
      shader.uniforms.uPlateTime = lamps.uPlateTime;
    }
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    const wv = world ? 'varying vec3 vPlateWorld;\n' : '';
    vs = vs.replace('#include <common>', '#include <common>\n' + wv + vertexPars);
    if (world || vertexMain) {
      vs = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + (world ? `{ vec4 pw = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
        pw = instanceMatrix * pw;
        #endif
        vPlateWorld = ( modelMatrix * pw ).xyz; }\n` : '') + vertexMain);
    }
    for (const [anchor, code, mode] of vert) vs = inject(vs, anchor, code, mode);
    fs = fs.replace('#include <common>', '#include <common>\n' + wv + (lamps ? LAMP_PARS : '') + fragPars);
    if (lamps) fs = fs.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n' + LAMP_LOOP);
    for (const [anchor, code, mode] of frag) fs = inject(fs, anchor, code, mode);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => 'plate:' + key + ':' + (lamps ? lamps.count : 0) + ':' + (world ? 1 : 0);
  return material;
}

function inject(src, anchor, code, mode = 'after') {
  const tag = `#include <${anchor}>`;
  if (!src.includes(tag)) throw new Error('plate patch: missing ' + tag);
  if (mode === 'replace') return src.replace(tag, code);
  if (mode === 'before') return src.replace(tag, code + '\n' + tag);
  return src.replace(tag, tag + '\n' + code);
}

export function std(THREE, params, lamps, extra = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  return patchMaterial(m, { lamps, ...extra });
}

export function setUV(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
    uv[i * 2] = r[0]; uv[i * 2 + 1] = r[1];
  }
  geo.setAttribute('uv', new geo.attributes.position.constructor(uv, 2));
  return geo;
}
