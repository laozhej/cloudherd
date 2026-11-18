// Post: soft bloom, then a miniature-diorama finish (tilt-shift blur, vignette, a touch of saturation).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { G } from './state.js';

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTilt: { value: 1 }, uFocus: { value: 0.5 }, uFade: { value: 1 }, uFlash: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTilt, uFocus, uFade, uFlash, uWarm;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      float b = smoothstep(0.26, 0.62, abs(uv.y - uFocus)) * uTilt;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      if (b > 0.02) {
        vec2 px = b * 1.6 / uRes;
        vec3 acc = col; float w = 1.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996;
          float r = sqrt(float(i) + 0.5) / 3.5;
          vec2 o = vec2(cos(a), sin(a)) * r * px * 3.4;
          acc += texture2D(tDiffuse, uv + o).rgb; w += 1.0;
        }
        col = acc / w;
      }
      vec2 c = uv - 0.5;
      col *= 1.0 - dot(c, c) * 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.1);
      col = mix(col, col * vec3(1.06, 0.98, 0.9), uWarm);
      col += vec3(0.85, 0.9, 1.0) * uFlash * 0.22;
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
};

export const QUALITY = {
  low: { budget: 1.1e6, msaa: 0, shadows: false, shadowSize: 1024, bloom: false },
  medium: { budget: 2.0e6, msaa: 2, shadows: true, shadowSize: 1024, bloom: true },
  high: { budget: 3.4e6, msaa: 4, shadows: true, shadowSize: 2048, bloom: true },
};

export function createPost(renderer, scene, camera) {
  const q0 = QUALITY[G.settings.quality] || QUALITY.high;
  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: q0.msaa });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 1.05);
  const finalPass = new ShaderPass(FinalShader);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(finalPass);
  const U = finalPass.uniforms;
  return {
    composer, bloom, U,
    apply() {
      const q = QUALITY[G.settings.quality] || QUALITY.high;
      const pr = Math.min(window.devicePixelRatio || 1, Math.sqrt(q.budget / (innerWidth * innerHeight)), 2);
      renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
      composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== q.msaa) { rt.samples = q.msaa; rt.dispose(); }
      bloom.enabled = q.bloom;
      if (G.sky) {
        G.sky.sun.castShadow = q.shadows;
        if (G.sky.sun.shadow.mapSize.x !== q.shadowSize) { G.sky.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); G.sky.sun.shadow.map?.dispose(); G.sky.sun.shadow.map = null; }
      }
      U.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
      U.uTilt.value = G.settings.tilt ? 1 : 0;
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    },
    render(dt) { composer.render(dt); },
  };
}
