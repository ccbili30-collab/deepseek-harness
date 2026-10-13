// Local resampling: crop a region of a generated world and rebuild it as a
// denser child heightmap, so the child pipeline recalculates geography at
// higher detail instead of clipping the parent's rendered geometry.
// Ported from Azgaar's Fantasy-Map-Generator resampler idea (MIT), adapted to
// explicit data: the parent world is passed in, the child is only a source.
import type { GridGraph, Point, World, WorldConfig } from "./types.ts";
import type { Rng } from "./rng.ts";
import { createRng } from "./rng.ts";
import { getGridDims, findCell } from "./grid.ts";
import { rn } from "./utils.ts";

/** normalized parent map rect [x0,y0,x1,y1]: fractions of parent width/height, [0,1]×[0,1] */
export type ResampleRegion = readonly [number, number, number, number];

/** resampled child source material: dense height grid + the config it was built for */
export interface ResampledWorld {
  /** 0-100 heights, one per child grid lattice cell (cellsX*cellsY of config) */
  readonly heights: number[];
  /** child WorldConfig overrides: denser cells + entity counts scaled to the region */
  readonly config: Partial<WorldConfig>;
  /** deterministic seed derived from parent seed + region */
  readonly seed: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** deterministic seed for the child: parent seed + region box hashed together */
const deriveSeed = (parentSeed: string, region: ResampleRegion): string => {
  let h = 2166136261;
  for (const ch of `${parentSeed}|${region.map(v => v.toFixed(4)).join(",")}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `${parentSeed}-r${(h >>> 0).toString(36)}`;
};

/**
 * Resample a normalized region of the parent world into a denser child heightmap.
 * Sampling is done on the child grid's lattice centers so the stored heights stay
 * aligned no matter how the child grid jitter lands on the same seed.
 * @param world generated parent world (its grid supplies the source heights)
 * @param region normalized [x0,y0,x1,y1] as fractions of parent width/height — the
 * same [0,1] space as editor objects, draft geometry and `window` rects
 * @param density cell-count multiplier relative to parent density (>=1)
 * @returns heights + config for a child `generateWorld({heightmap:{kind:'heights'}})` call
 */
export function resampleWorld(
  world: World,
  region: ResampleRegion,
  density = 2
): ResampledWorld {
  const [x0, y0, x1, y1] = region;
  const ph = world.config.height;
  const pw = world.config.width;
  // region size in parent pixels: normalized x/y are fractions of width/height
  const rw = Math.max(1, (x1 - x0) * pw);
  const rh = Math.max(1, (y1 - y0) * ph);

  // child canvas: region scaled so the long edge is ~800px; density multiplies cell count
  const regionCells = (world.config.points * rw * rh) / (pw * ph);
  const childPoints = Math.round(clamp(regionCells * density, 800, world.config.points * 3));
  const canvasScale = 800 / Math.max(rw, rh);
  const childW = Math.round(clamp(rw * canvasScale, 200, 2400));
  const childH = Math.round(clamp(rh * canvasScale, 200, 2400));
  const { cellsX, cellsY } = getGridDims(childW, childH, childPoints);
  const spacing = Math.sqrt((childW * childH) / childPoints);

  const seed = deriveSeed(world.config.seed, region);
  const rng: Rng = createRng(seed);
  const grid: GridGraph = world.grid;

  // sample parent height at each child lattice center, then add deterministic
  // relief noise scaled to the zoom factor so detail grows with magnification
  const zoom = ph / rh; // normalized-space zoom of the child over the parent
  const noiseAmp = clamp(2 + zoom * 1.2, 2, 8);
  const heights = new Float64Array(cellsX * cellsY);
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const px = (x0 + ((cx + 0.5) * spacing / childW) * (x1 - x0)) * pw;
      const py = (y0 + ((cy + 0.5) * spacing / childH) * (y1 - y0)) * ph;
      const h = grid.cells.h[findCell(px, py, grid)] ?? 0;
      heights[cy * cellsX + cx] = h;
    }
  }
  // one lattice blur keeps resampled coastlines smooth before adding detail
  const blurred = new Float64Array(heights.length);
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= cellsX || yy >= cellsY) continue;
          sum += heights[yy * cellsX + xx]; n++;
        }
      }
      blurred[cy * cellsX + cx] = sum / n;
    }
  }
  for (let i = 0; i < blurred.length; i++) {
    const h = blurred[i];
    // relief noise only on land — keep water flat so coasts stay crisp
    const n = h >= 20 ? (rng() - 0.5) * 2 * noiseAmp : (rng() - 0.5) * noiseAmp * 0.3;
    blurred[i] = rn(clamp(h + n, 0, 100), 1);
  }

  // entity counts scale with the square root of the covered area: a 1/4 map
  // region gets roughly half the states, not the parent's full political layer
  const frac = Math.sqrt(clamp((rw * rh) / (pw * ph), 0.02, 1));
  const config: Partial<WorldConfig> = {
    width: childW,
    height: childH,
    points: childPoints,
    names: world.config.names,
    cultures: { ...world.config.cultures, limit: Math.max(3, Math.round(world.config.cultures.limit * frac)) },
    states: { ...world.config.states, limit: Math.max(3, Math.round(world.config.states.limit * frac)) },
  };
  return { heights: [...blurred].map(v => Math.round(v)), config, seed };
}

/** normalized bbox of world-pixel points in [0,1] space (x / parent width, y / parent height) */
export function regionOfPoints(points: readonly Point[], parentWidth: number, parentHeight: number, pad = 0.04, xMax = 1): ResampleRegion {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [
    clamp((x0 - pad * parentWidth) / parentWidth, 0, xMax),
    clamp((y0 - pad * parentHeight) / parentHeight, 0, 1),
    clamp((x1 + pad * parentWidth) / parentWidth, 0, xMax),
    clamp((y1 + pad * parentHeight) / parentHeight, 0, 1),
  ];
}
