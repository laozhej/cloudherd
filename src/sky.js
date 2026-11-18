// Sun path, light colours through the day, sky dome and haze.
import * as THREE from 'three';
import { G } from './state.js';
import { lerp, clamp } from './util.js';

// keyframes over the day (0 sunrise .. 1 sunset)
const KEYS = [
  { t: 0.00, sun: 0xffbe90, si: 2.0, amb: 0xd2bccb, ai: 1.15, haze: 0xf4d2bf, top: 0x9fbbe2 },
  { t: 0.14, sun: 0xffe4c0, si: 2.35, amb: 0xc6d4e8, ai: 1.1, haze: 0xcfe3ec, top: 0x83b6e8 },
  { t: 0.50, sun: 0xfff3e2, si: 2.55, amb: 0xbfd6ee, ai: 1.05, haze: 0xa9d8ee, top: 0x5ea8e8 },
  { t: 0.84, sun: 0xffd8a8, si: 2.35, amb: 0xd2c6da, ai: 1.08, haze: 0xebd0bc, top: 0x86a6dc },
  { t: 1.00, sun: 0xffa070, si: 1.8, amb: 0xc8a2b8, ai: 1.02, haze: 0xf2b494, top: 0x7a80c4 },
];
const _a = new THREE.Color(), _b = new THREE.Color();
function keyAt(t, field, out) {
  t = clamp(t, 0, 1);
  let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const A = KEYS[i], B = KEYS[i + 1], u = clamp((t - A.t) / (B.t - A.t), 0, 1);
  if (typeof A[field] === 'number' && field.length <= 2) return lerp(A[field], B[field], u);
  _a.setHex(A[field]); _b.setHex(B[field]);
  return out.copy(_a).lerp(_b, u);
}

export function createSky(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  const S = sun.shadow;
  S.mapSize.set(2048, 2048);
  S.camera.left = -74; S.camera.right = 74; S.camera.top = 74; S.camera.bottom = -74;
  S.camera.near = 10; S.camera.far = 320;
  S.bias = -0.0004; S.normalBias = 0.06;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd6ee, 0x8a7a5a, 1.0);
  scene.add(hemi);

  // sky dome, only seen from the title camera and at the horizon
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uSunDir: G.shared.sunDir, uSunCol: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uTop, uHaze, uSunDir, uSunCol; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(uHaze, uTop, smoothstep(0.0, 0.55, h));
        c = mix(c, uHaze * 0.92, smoothstep(0.02, -0.2, h));
        float sd = clamp(dot(normalize(vDir), uSunDir), 0.0, 1.0);
        c += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), domeMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  scene.add(dome);

  const haze = new THREE.Color(), top = new THREE.Color(), sunCol = new THREE.Color(), amb = new THREE.Color();
  const sunDir = new THREE.Vector3();
  scene.background = haze;

  return {
    sun, hemi, dome, haze, sunDir,
    update(t, camera) {
      // the sun rises in the east (+x), crosses the south (toward the camera) and sets in the west
      const el = THREE.MathUtils.degToRad(lerp(15, 60, Math.sin(Math.PI * clamp(t, 0, 1))));
      const az = lerp(0.12, Math.PI - 0.12, clamp(t, 0, 1));
      sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az) * 0.75 + 0.25).normalize();
      sun.position.copy(sunDir).multiplyScalar(160);
      sun.target.position.set(0, 0, 0);
      keyAt(t, 'sun', sunCol); const si = keyAt(t, 'si');
      sun.color.copy(sunCol); sun.intensity = si;
      keyAt(t, 'amb', amb); hemi.color.copy(amb); hemi.intensity = keyAt(t, 'ai');
      keyAt(t, 'haze', haze); keyAt(t, 'top', top);
      domeMat.uniforms.uTop.value.copy(top); domeMat.uniforms.uHaze.value.copy(haze); domeMat.uniforms.uSunCol.value.copy(sunCol);
      G.shared.sunDir.value.copy(sunDir);
      G.shared.sunColor.value.copy(sunCol).multiplyScalar(si * 0.42);
      G.shared.ambient.value.copy(amb).multiplyScalar(0.55);
      G.shared.dusk.value = clamp((t - 0.82) / 0.16, 0, 1);
      if (camera) dome.position.copy(camera.position);
      if (G.island) G.island.setFog(haze, 170, 560);
    },
  };
}
