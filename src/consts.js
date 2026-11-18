// World layout constants shared by every module.
export const GRID = 128;           // simulation grid resolution (moisture, burn, fire)
export const WORLD = 128;          // the grid covers [-64, 64] in x and z
export const CELL = WORLD / GRID;  // one world unit per cell
export const HALF = WORLD / 2;
export const CLOUD_Y = 12;         // base altitude of the cloud layer
export const SPRITE_Y = 13.6;      // the wind spirit flies in the middle of the layer
export const BOUND = 64;           // clouds are nudged back inside this radius
export const RAIN_MASS = 3;        // a cloud this heavy starts to rain
export const STORM_MASS = 7;       // ...and this heavy it becomes a thunderhead
export const MAX_MASS = 14;

export const cellOf = (x) => Math.floor((x + HALF) / CELL);
export const cellCenter = (i) => -HALF + (i + 0.5) * CELL;
