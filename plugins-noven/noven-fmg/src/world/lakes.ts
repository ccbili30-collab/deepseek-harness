// Lakes: turn land depressions that cannot pour to water into lakes on the grid,
// breach near-sea lakes, and give pack lakes their shoreline, height and climate.
// Ported from Azgaar's Fantasy-Map-Generator (MIT).
import { mean, min } from "d3";
import type { Feature, GridGraph, PackGraph, World } from "./types.ts";
import { isLand, rn, SEA_LEVEL, unique } from "./utils.ts";

const LAKE_ELEVATION_DELTA = 0.1;

/** lake surface height = lowest shore cell height minus a hair */
export const getLakeHeight = (feature: Feature, pack: PackGraph): number => {
  const heights = pack.cells.h;
  const minShoreHeight = min(feature.shoreline.map(cellId => heights[cellId])) || SEA_LEVEL;
  return rn(minShoreHeight - LAKE_ELEVATION_DELTA, 2);
};

/** land cells adjacent to a feature's vertex chain */
export const getLakeShoreline = (feature: Feature, pack: PackGraph): number[] =>
  unique(feature.vertices.flatMap(vertexIndex => pack.vertices.c[vertexIndex].filter(index => isLand(index, pack))));

/** cell groups of the land depressions that cannot pour to water within the elevation limit */
export const findDeepDepressionLakes = (
  cells: Pick<GridGraph["cells"], "i" | "c" | "b" | "h">,
  elevationLimit: number
): number[][] => {
  if (elevationLimit === 80) return [];

  const { c, b } = cells;
  const h = Uint8Array.from(cells.h); // lakes form in turn: an earlier one is the water a later check can reach
  const lakes: number[][] = [];

  for (const i of cells.i) {
    if (b[i] || h[i] < SEA_LEVEL) continue;
    if (h[i] > (min(c[i].map(neibId => h[neibId])) as number)) continue;

    let deep = true;
    const threshold = h[i] + elevationLimit;
    const queue = [i];
    const checked: boolean[] = [];
    checked[i] = true;

    while (deep && queue.length) {
      const q = queue.pop() as number;

      for (const n of c[q]) {
        if (checked[n]) continue;
        if (h[n] >= threshold) continue;
        if (h[n] < SEA_LEVEL) {
          deep = false;
          break;
        }

        checked[n] = true;
        queue.push(n);
      }
    }

    if (!deep) continue;
    const lakeCells = [i, ...c[i].filter(n => h[n] === h[i])];
    for (const cell of lakeCells) h[cell] = 19;
    lakes.push(lakeCells);
  }

  return lakes;
};

/** turn grid depressions that cannot pour to water into lakes */
export const addDeepDepressionLakes = (grid: GridGraph, elevationLimit: number): void => {
  const { cells, features } = grid;

  for (const lakeCells of findDeepDepressionLakes(cells, elevationLimit)) {
    const featureId = features.length;

    for (const i of lakeCells) {
      cells.h[i] = 19;
      cells.t[i] = -1;
      cells.f[i] = featureId;

      for (const n of cells.c[i]) {
        if (!lakeCells.includes(n)) cells.t[n] = 1; // the lake shore is a coastline now
      }
    }

    features.push({ i: featureId, land: false, border: false, type: "lake" });
  }
};

/** near-sea lakes get a lot of inflow; most should breach the threshold and flow out */
export const openNearSeaLakes = (grid: GridGraph): void => {
  const { cells, features } = grid;
  if (!features.find(f => f?.type === "lake")) return;
  const LIMIT = 22; // max height that can be breached by water

  const removeLake = (thresholdCellId: number, lakeFeatureId: number, oceanFeatureId: number) => {
    cells.h[thresholdCellId] = 19;
    cells.t[thresholdCellId] = -1;
    cells.f[thresholdCellId] = oceanFeatureId;
    for (const c of cells.c[thresholdCellId]) {
      if (cells.h[c] >= SEA_LEVEL) cells.t[c] = 1;
    }

    for (const i of cells.i) {
      if (cells.f[i] === lakeFeatureId) cells.f[i] = oceanFeatureId;
    }
    features[lakeFeatureId].type = "ocean";
  };

  for (const i of cells.i) {
    const lakeFeatureId = cells.f[i];
    if (features[lakeFeatureId]?.type !== "lake") continue;

    check_neighbours: for (const c of cells.c[i]) {
      if (cells.t[c] !== 1 || cells.h[c] > LIMIT) continue;

      for (const n of cells.c[c]) {
        const ocean = cells.f[n];
        if (features[ocean]?.type !== "ocean") continue;
        removeLake(c, lakeFeatureId, ocean);
        break check_neighbours;
      }
    }
  }
};

/** lake flux, temperature, evaporation and the lowest-shore outlet cell; returns lakeOutCells */
export const defineLakeClimateData = (world: World, heights: ArrayLike<number>): Uint16Array => {
  const { grid, pack, config } = world;
  const { cells, features } = pack;
  const lakeOutCells = new Uint16Array(cells.i.length);

  const getFlux = (lake: Feature) => lake.shoreline.reduce((acc, c) => acc + grid.cells.prec[cells.g[c]], 0);

  const getLakeTemp = (lake: Feature) => {
    if (lake.cells < 6) return grid.cells.temp[cells.g[lake.firstCell]];
    return rn(mean(lake.shoreline.map(c => grid.cells.temp[cells.g[c]])) as number, 1);
  };

  const getLakeEvaporation = (lake: Feature) => {
    const height = (lake.height - 18) ** config.heightExponent; // height in meters
    const evaporation = ((700 * (lake.temp + 0.006 * height)) / 50 + 75) / (80 - lake.temp); // Penman formula
    return rn(evaporation * lake.cells);
  };

  features.forEach(feature => {
    if (feature?.type !== "lake") return;
    feature.flux = getFlux(feature);
    feature.temp = getLakeTemp(feature);
    feature.evaporation = getLakeEvaporation(feature);
    if (feature.closed) return; // no outlet for lakes in depressed areas

    feature.outCell = feature.shoreline.reduce((minCell, c) => (heights[c] < heights[minCell] ? c : minCell));
    lakeOutCells[feature.outCell as number] = feature.i;
  });

  return lakeOutCells;
};

/** check if a pack lake can potentially be open (not in a deep depression) */
export const detectClosedLakes = (world: World, h: ArrayLike<number>, elevationLimit: number): void => {
  const { cells, features } = world.pack;

  features.forEach(feature => {
    if (feature?.type !== "lake") return;
    delete feature.closed;

    const MAX_ELEVATION = feature.height + elevationLimit;
    if (MAX_ELEVATION > 99) {
      feature.closed = false;
      return;
    }

    let isDeep = true;
    const lowestShorelineCell = feature.shoreline.reduce((minCell, c) => (h[c] < h[minCell] ? c : minCell));
    const queue = [lowestShorelineCell];
    const checked: boolean[] = [];
    checked[lowestShorelineCell] = true;

    while (queue.length && isDeep) {
      const cellId: number = queue.pop() as number;

      for (const neibCellId of cells.c[cellId]) {
        if (checked[neibCellId]) continue;
        if (h[neibCellId] >= MAX_ELEVATION) continue;

        if (h[neibCellId] < SEA_LEVEL) {
          const nFeature = features[cells.f[neibCellId]];
          if (nFeature.type === "ocean" || feature.height > nFeature.height) isDeep = false;
        }

        checked[neibCellId] = true;
        queue.push(neibCellId);
      }
    }

    feature.closed = isDeep;
  });
};

/** drop stale river links from lakes after a regeneration */
export const cleanupLakeData = (pack: PackGraph): void => {
  for (const feature of pack.features) {
    if (feature?.type !== "lake") continue;
    delete feature.river;
    delete feature.enteringFlux;
    delete feature.outCell;
    delete feature.closed;
    feature.height = rn(feature.height, 3);

    const inlets = feature.inlets?.filter(r => pack.rivers.find(river => river.i === r));
    if (!inlets?.length) delete feature.inlets;
    else feature.inlets = inlets;

    const outlet = feature.outlet && pack.rivers.find(river => river.i === feature.outlet);
    if (!outlet) delete feature.outlet;
  }
};
