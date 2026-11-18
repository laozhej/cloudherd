// A tiny kitbash helper: colour primitives, place them, merge into one flat-shaded geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

function prep(geo, color, glow) {
  if (geo.index) geo = geo.toNonIndexed();
  const n = geo.attributes.position.count;
  _c.set(color);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color', 'aGlow'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

// triangular prism (a gable roof): width along x, ridge along z
export function prismGeometry(w, h, d) {
  const x = w / 2, z = d / 2;
  const A = [-x, 0, -z], B = [x, 0, -z], C = [0, h, -z], D = [-x, 0, z], E = [x, 0, z], F = [0, h, z];
  const tris = [A, C, B, D, E, F, A, D, F, A, F, C, B, C, F, B, F, E, A, B, E, A, E, D];
  const pos = new Float32Array(tris.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

export class Kit {
  constructor() { this.parts = []; }
  add(geo, color, o = {}) {
    const g = prep(geo, color, o.glow || 0);
    const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s || [1, 1, 1];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    this.parts.push(g);
    return this;
  }
  box(w, h, d, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, seg, color, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, o); }
  cone(r, h, seg, color, o) { return this.add(new THREE.ConeGeometry(r, h, seg), color, o); }
  ball(r, color, o, detail = 1) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, o); }
  prism(w, h, d, color, o) { return this.add(prismGeometry(w, h, d), color, o); }
  merge(other, o = {}) {
    // add another kit's parts with an extra transform
    const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s || [1, 1, 1];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    for (const g of other.parts) this.parts.push(g.clone().applyMatrix4(_m));
    return this;
  }
  build() {
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
