// Drives segmented emissive groups (cyclotron, power cell, bargraph, light bars) through the `_seg` vertex attribute.
import * as THREE from 'three';

export function segmentize(mesh, count = 32, boost = 6) {
  const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const mat = src.clone();
  const levels = new Float32Array(32);
  const base = mat.emissive ? mat.emissive.clone() : new THREE.Color(1, 1, 1);
  if (mat.emissive && mat.emissive.getHex() === 0 && mat.color) mat.emissive.copy(mat.color);
  if ('emissiveIntensity' in mat) mat.emissiveIntensity = boost;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSeg = { value: levels };
    sh.vertexShader = 'attribute float _seg;\nuniform float uSeg[32];\nvarying float vSegI;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSegI = uSeg[int(clamp(_seg + 0.5, 0.0, 31.0))];');
    sh.fragmentShader = 'varying float vSegI;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vSegI;');
  };
  mat.customProgramCacheKey = () => 'seg32';
  mesh.material = mat;
  const n = Math.min(32, mesh.userData.segments || mesh.parent?.userData?.segments || count);
  return { levels, count: n, material: mat, base };
}
