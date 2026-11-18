// Injects shared world-space effects into three's built-in Lambert material:
// cloud shade (soft vertical shadows under every cloud), lightning flash,
// moisture-driven grass, field soil, burn scars and window glow at dusk.
import { G, MAX_FOOT } from './state.js';
import { HALF, WORLD } from './consts.js';

export const GLSL_COMMON = /* glsl */`
uniform sampler2D uField;
uniform vec4 uFeet[${MAX_FOOT}];
uniform int uFootCount;
uniform float uFlash, uDusk, uTime;
#define SRGB(c) pow(max(c, vec3(0.0)), vec3(2.2))
vec4 fieldAt(vec2 xz){ vec4 t = texture2D(uField, (xz + ${HALF.toFixed(1)}) / ${WORLD.toFixed(1)}); t.r *= 1.25; return t; }
float cloudShade(vec2 xz){
  float s = 1.0;
  for (int i = 0; i < ${MAX_FOOT}; i++){
    if (i >= uFootCount) break;
    vec4 f = uFeet[i];
    float d = length(xz - f.xy);
    s *= 1.0 - f.w * smoothstep(f.z, f.z * 0.45, d);
  }
  return s;
}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
vec3 grassCol(float m, float n){
  vec3 dry = SRGB(vec3(0.85, 0.76, 0.47));
  vec3 mid = SRGB(vec3(0.70, 0.74, 0.40));
  vec3 lush = SRGB(vec3(0.45, 0.70, 0.30));
  vec3 deep = SRGB(vec3(0.27, 0.55, 0.24));
  vec3 c = m < 0.33 ? mix(dry, mid, m / 0.33) : m < 0.7 ? mix(mid, lush, (m - 0.33) / 0.37) : mix(lush, deep, clamp((m - 0.7) / 0.45, 0.0, 1.0));
  return c * (0.9 + n * 0.2);
}
`;

const uniformsOf = () => ({
  uField: G.shared.fieldTex, uFeet: G.shared.feet, uFootCount: G.shared.footCount,
  uFlash: G.shared.flash, uDusk: G.shared.dusk, uTime: G.shared.time, uDetail: G.shared.detailTex,
});

/**
 * opts.terrain: per-vertex aGrass weight blends the vertex colour toward moisture-driven grass, burn scars, fire glow
 * opts.soil:    plowed field soil, dark when wet, cracked when dry (uses uv for furrows)
 * opts.glow:    per-vertex aGlow lights up at dusk (windows, lamps)
 * opts.noShade: skip the cloud shade (things that sit above the clouds)
 */
export function patchMaterial(mat, opts = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformsOf());
    let vdecl = 'varying vec3 vWPos;\n';
    let fdecl = 'varying vec3 vWPos;\n' + GLSL_COMMON;
    if (opts.terrain) { vdecl += 'attribute float aGrass; varying float vGrass;\n'; fdecl += 'varying float vGrass;\nuniform sampler2D uDetail;\n'; }
    if (opts.glow) { vdecl += 'attribute float aGlow; varying float vGlow;\n'; fdecl += 'varying float vGlow;\n'; }
    if (opts.soil) { vdecl += 'varying vec2 vSoilUv;\n'; fdecl += 'varying vec2 vSoilUv;\n'; }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + vdecl)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp_ = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp_ = instanceMatrix * wp_;
        #endif
        vWPos = (modelMatrix * wp_).xyz;
        ${opts.terrain ? 'vGrass = aGrass;' : ''}
        ${opts.glow ? 'vGlow = aGlow;' : ''}
        ${opts.soil ? 'vSoilUv = uv;' : ''}`);
    let frag = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + fdecl);
    if (opts.terrain) {
      frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec4 F = fieldAt(vWPos.xz);
          float n = vn2(vWPos.xz * 0.45) * 0.6 + vn2(vWPos.xz * 1.7) * 0.4;
          vec3 g = grassCol(F.r + (n - 0.5) * 0.12, n);
          vec3 c = mix(diffuseColor.rgb, g, vGrass);
          vec4 D = texture2D(uDetail, (vWPos.xz + 75.0) / 150.0);
          c = mix(c, SRGB(vec3(0.84, 0.72, 0.50)) * (0.9 + n * 0.18), D.r);
          c = mix(c, SRGB(vec3(0.56, 0.47, 0.33)) * (0.9 + n * 0.2), D.g);
          vec2 cq = vWPos.xz * vec2(2.2, 3.0); cq.x += floor(cq.y) * 0.5;
          vec2 cf = fract(cq) - 0.5; float stone = smoothstep(0.5, 0.36, max(abs(cf.x), abs(cf.y)));
          c = mix(c, SRGB(vec3(0.86, 0.80, 0.68)) * (0.72 + 0.28 * stone) * (0.92 + h21(floor(cq)) * 0.16), D.b);
          // burn scar: charcoal with ash speckle
          vec3 ash = SRGB(vec3(0.20, 0.18, 0.17)) * (0.8 + h21(floor(vWPos.xz * 3.0)) * 0.5);
          c = mix(c, ash, F.g * 0.92 * max(vGrass, 0.35));
          // fresh rain darkens the ground a little
          c *= 1.0 - F.a * 0.22;
          diffuseColor.rgb = c;
        }`);
      frag = frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec4 F = fieldAt(vWPos.xz); float fl = 0.6 + 0.4 * sin(uTime * 11.0 + vWPos.x * 2.3) * sin(uTime * 7.0 + vWPos.z * 3.1);
          totalEmissiveRadiance += vec3(1.0, 0.36, 0.06) * F.b * fl * 1.4; }`);
    }
    if (opts.soil) {
      frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec4 F = fieldAt(vWPos.xz);
          float m = clamp(F.r, 0.0, 1.0);
          vec3 dryS = SRGB(vec3(0.74, 0.58, 0.40)), wetS = SRGB(vec3(0.36, 0.24, 0.15));
          float furrow = 0.5 + 0.5 * sin(vSoilUv.y * 6.2831 * 9.0);
          vec3 c = mix(dryS, wetS, smoothstep(0.1, 0.8, m)) * (0.8 + furrow * 0.3);
          // cracks show up when the soil is parched
          vec2 q = vWPos.xz * 1.6; vec2 cell = floor(q); vec2 f = fract(q);
          float d1 = 9.0, d2 = 9.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y)); vec2 p = o + vec2(h21(cell + o), h21(cell + o + 17.1)) - f;
            float d = dot(p, p);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
          float crack = 1.0 - smoothstep(0.03, 0.1, sqrt(d2) - sqrt(d1));
          c = mix(c, c * 0.55, crack * smoothstep(0.28, 0.05, m));
          c = mix(c, SRGB(vec3(0.16, 0.15, 0.14)), F.g * 0.85);
          c *= 1.0 - F.a * 0.15;
          diffuseColor.rgb = c;
        }`);
    }
    if (opts.glow) {
      frag = frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.36) * vGlow * uDusk * 2.2;`);
    }
    frag = frag.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      ${opts.noShade ? '' : 'reflectedLight.directDiffuse *= cloudShade(vWPos.xz);'}
      reflectedLight.indirectDiffuse += diffuseColor.rgb * uFlash * 0.45;`);
    sh.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => 'ch|' + (opts.terrain ? 't' : '') + (opts.soil ? 's' : '') + (opts.glow ? 'g' : '') + (opts.noShade ? 'n' : '');
  return mat;
}
