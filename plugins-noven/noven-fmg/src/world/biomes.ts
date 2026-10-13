// Biomes: temperature + moisture + height → the biome per pack cell.
// Ported from Azgaar's Fantasy-Map-Generator (MIT).
import { mean } from "d3";
import type { Biome, World } from "./types.ts";
import { rn, SEA_LEVEL } from "./utils.ts";

const getDefaultBiomes = (): Biome[] => {
  const name = [
    "Marine",
    "Hot desert",
    "Cold desert",
    "Savanna",
    "Grassland",
    "Tropical seasonal forest",
    "Temperate deciduous forest",
    "Tropical rainforest",
    "Temperate rainforest",
    "Taiga",
    "Tundra",
    "Glacier",
    "Wetland"
  ];

  const color = [
    "#466eab",
    "#fbe79f",
    "#b5b887",
    "#d2d082",
    "#c8d68f",
    "#b6d95d",
    "#29bc56",
    "#7dcb35",
    "#409c43",
    "#4b6b32",
    "#96784b",
    "#d5e7eb",
    "#0b9131"
  ];
  const habitability = [0, 4, 10, 22, 30, 50, 100, 80, 90, 12, 4, 0, 12];
  const cost = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150];

  return name.map((name, i) => ({ i, name, color: color[i], habitability: habitability[i], cost: cost[i] }));
};

// hot ↔ cold [>19°C; <-4°C]; dry ↕ wet
const biomesMatrix = [
  new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10]),
  new Uint8Array([3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([5, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10])
];

const isWetland = (moisture: number, temperature: number, height: number) => {
  if (temperature <= -2) return false;
  if (moisture > 40 && height < 25) return true; // near coast
  if (moisture > 24 && height > 24 && height < 60) return true; // off coast
  return false;
};

export const getBiomeId = (moisture: number, temperature: number, height: number, hasRiver: boolean) => {
  if (height < SEA_LEVEL) return 0; // all water cells: marine biome
  if (temperature < -5) return 11; // too cold: permafrost biome
  if (temperature >= 25 && !hasRiver && moisture < 8) return 1; // too hot and dry: hot desert
  if (isWetland(moisture, temperature, height)) return 12; // too wet: wetland

  const moistureBand = Math.min((moisture / 5) | 0, 4); // [0-4]
  const temperatureBand = Math.min(Math.max(20 - temperature, 0), 25); // [0-25]
  return biomesMatrix[moistureBand][temperatureBand];
};

/** assign the default biomes and paint every pack cell */
export const defineBiomes = (world: World): void => {
  const { grid, pack } = world;
  if (!pack.biomes?.length) pack.biomes = getDefaultBiomes();

  const { fl: flux, r: riverIds, h: heights, c: neighbors, g: gridReference } = pack.cells;
  const { temp, prec } = grid.cells;
  pack.cells.biome = new Uint8Array(pack.cells.i.length);

  const calculateMoisture = (cellId: number) => {
    let moisture = prec[gridReference[cellId]];
    if (riverIds[cellId]) moisture += Math.max(flux[cellId] / 10, 2);

    const moistAround = neighbors[cellId]
      .filter((neibCellId: number) => heights[neibCellId] >= SEA_LEVEL)
      .map((c: number) => prec[gridReference[c]])
      .concat([moisture]);
    return rn(4 + (mean(moistAround) as number));
  };

  for (let cellId = 0; cellId < heights.length; cellId++) {
    const height = heights[cellId];
    const moisture = height < SEA_LEVEL ? 0 : calculateMoisture(cellId);
    const temperature = temp[gridReference[cellId]];
    pack.cells.biome[cellId] = getBiomeId(moisture, temperature, height, Boolean(riverIds[cellId]));
  }
};
