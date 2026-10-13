// Cell suitability + rural population — the placement score every later
// generator step (culture centers, capitals, towns) reads.
// Adapted from Azgaar's Fantasy-Map-Generator (MIT); goods trade is not ported.
import { max, mean, median } from "d3";
import type { World } from "./types.ts";
import { isWater, normalize } from "./utils.ts";

const COAST_SCORES: Record<string, number> = {
  estuary: 15,
  ocean_coast: 5,
  save_harbor: 20,
  freshwater: 30,
  salt: 10,
  frozen: 1,
  dry: -5,
  sinkhole: -5,
  lava: -30
};

/** assess cells suitability: writes cells.s (score) and cells.pop (rural population) */
export const rankCells = (world: World): void => {
  const { cells, features, biomes } = world.pack;
  const n = cells.i.length;

  cells.s = new Float32Array(n);
  cells.pop = new Float32Array(n);

  const meanFlux = median(cells.fl.filter(f => f)) || 0;
  const maxFlux = (max(cells.fl) || 0) + (max(cells.conf) || 0); // to normalize flux
  const meanArea = mean(cells.area) || 1; // to adjust population by cell area

  for (const i of cells.i) {
    if (isWater(i, world.pack)) continue;
    let score = biomes[cells.biome[i]].habitability;
    if (!score) continue; // uninhabitable biome

    if (meanFlux) score += normalize(cells.fl[i] + cells.conf[i], meanFlux, maxFlux) * 250;
    score -= (cells.h[i] - 50) / 5;

    if (cells.t[i] === 1) {
      if (cells.r[i]) score += COAST_SCORES.estuary;
      const feature = features[cells.f[cells.haven[i]]];
      if (feature.type === "lake") {
        score += COAST_SCORES[feature.subtype] || 0;
      } else {
        score += COAST_SCORES.ocean_coast;
        if (cells.harbor[i] === 1) score += COAST_SCORES.save_harbor;
      }
    }

    cells.s[i] = score / 5;
    cells.pop[i] = cells.s[i] > 0 ? (cells.s[i] * cells.area[i]) / meanArea : 0;
  }
};
