import * as THREE from 'three';

// One shared bag of game state. Modules register themselves here at boot and
// reach each other through it at runtime, which keeps imports acyclic.
export const MAX_FOOT = 24;
export const G = {
  renderer: null, scene: null, camera: null, composer: null,
  mode: 'boot',          // boot | title | week | intro | playing | paused | results
  time: 0,               // simulation time (seconds, stops while paused)
  real: 0,               // wall time
  timeScale: 1,
  pace: 1,               // < 1 while the tutorial is teaching: the clock, soil drying, crop growth and wilting all slow down
  test: false,
  settings: { volume: 0.8, music: 0.7, quality: 'high', lang: 'en', tilt: true, relaxed: false },
  progress: { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0], best: [0, 0, 0, 0, 0, 0, 0], free: false },
  dayT: 0.3,             // 0..1 progress from sunrise to sunset
  day: null,             // the active day definition (levels.js)
  wind: { x: 1, z: 0, speed: 1, angle: 0 },
  // uniforms shared by every custom shader
  shared: {
    time: { value: 0 },
    sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    ambient: { value: new THREE.Color(0.5, 0.55, 0.6) },
    fieldTex: { value: null },           // RGBA: moisture, burn, fire, wetness
    detailTex: { value: null },          // RGBA: dirt path, mud, cobbles
    feet: { value: Array.from({ length: MAX_FOOT }, () => new THREE.Vector4(0, 0, 0, 0)) }, // cloud footprints: x, z, radius, darkness
    footCount: { value: 0 },
    flash: { value: 0 },                 // lightning flash
    dusk: { value: 0 },                  // 0 by day, 1 at sunset (window lights)
  },
  island: null, climate: null, clouds: null, sprite: null, crops: null, fire: null,
  village: null, fx: null, sky: null, audio: null, hud: null, game: null, input: null,
};
