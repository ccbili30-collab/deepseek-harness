// The generation pipeline: ordered steps that grow a World out of a seed and a
// heightmap input. Mirrors FMG's generator order; every step reads and writes the
// explicit `world` object — no globals.
import type { World, WorldConfig } from "./types.ts";
import { DEFAULT_WORLD_CONFIG } from "./types.ts";
import { buildWorldNamer } from "./namer.ts";
import { createRng, generateSeed, type Rng } from "./rng.ts";
import { generateGrid } from "./grid.ts";
import { applyHeightmapSteps, heightsFromGray, heightsFromTemplate, getTemplateScript } from "./heightmap.ts";
import { markupGrid, markupPack, defineFeatureGroups, defineFeatureNames } from "./features.ts";
import { addDeepDepressionLakes, openNearSeaLakes } from "./lakes.ts";
import { computePrecipitation, computeTemperature, deriveCoordinates } from "./climate.ts";
import { repackGraph } from "./pack.ts";
import { generateRivers, specifyRivers } from "./rivers.ts";
import { defineBiomes } from "./biomes.ts";
import { rankCells } from "./population.ts";
import { expandCultures, generateCultures } from "./cultures.ts";
import { generateBurgs } from "./burgs.ts";
import { generateStates } from "./states.ts";
import { generateRoutes } from "./routes.ts";

/** how the heightmap (the pipeline's only creative input) is supplied */
export type HeightmapInput =
  | { kind: "template"; template: string } // a registered template id
  | { kind: "script"; script: string } // an inline template script
  | { kind: "heights"; heights: ArrayLike<number> } // per-cell heights 0–100 (e.g. a rasterized semantic draft)
  | { kind: "gray"; gray: ArrayLike<number> }; // per-cell grayscale 0–255 (e.g. a DEM image)

export interface GenerateWorldInput {
  seed?: string;
  config?: Partial<WorldConfig>;
  heightmap?: HeightmapInput;
  postSteps?: string[]; // template steps applied after the input (e.g. ["Smooth 2"])
}

/** resolve the heightmap input into grid cell heights */
const resolveHeights = (
  rng: Rng,
  world: World,
  input: HeightmapInput | undefined,
  postSteps: string[] | undefined
): Uint8Array => {
  const { grid, config } = world;
  const graphConfig = { points: config.points, width: config.width, height: config.height };

  let heights: Uint8Array;
  if (!input) {
    heights = heightsFromTemplate(rng, grid, getTemplateScript("continents"), graphConfig);
  } else if (input.kind === "template") {
    heights = heightsFromTemplate(rng, grid, getTemplateScript(input.template), graphConfig);
  } else if (input.kind === "script") {
    heights = heightsFromTemplate(rng, grid, input.script, graphConfig);
  } else if (input.kind === "gray") {
    heights = heightsFromGray(input.gray, grid.points.length);
  } else {
    heights = Uint8Array.from({ length: grid.points.length }, (_, i) => input.heights[i] ?? 0);
  }

  if (postSteps?.length) heights = applyHeightmapSteps(rng, grid, heights, postSteps, graphConfig);
  return heights;
};

/** build a complete world: grid → heights → features → climate → pack → rivers → biomes */
export const generateWorld = (input: GenerateWorldInput = {}): World => {
  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...input.config, seed: input.seed ?? generateSeed() };
  const rng = createRng(config.seed);

  const world = {
    config,
    coordinates: deriveCoordinates(config),
    grid: generateGrid(rng, config.width, config.height, config.points),
    pack: {} as World["pack"]
  } as World;
  // 函数不可枚举：structuredClone/序列化时跳过
  Object.defineProperty(world, "namer", { value: buildWorldNamer(world), writable: true, enumerable: false });

  world.grid.cells.h = resolveHeights(rng, world, input.heightmap, input.postSteps);

  markupGrid(world.grid);
  addDeepDepressionLakes(world.grid, config.lakeElevationLimit);
  openNearSeaLakes(world.grid);

  world.grid.cells.temp = computeTemperature(world, world.grid.cells.h);
  world.grid.cells.prec = computePrecipitation(world, rng, world.grid.cells.h, world.grid.cells.temp);

  world.pack = repackGraph(world);
  markupPack(world);
  generateRivers(world);
  defineBiomes(world);
  defineFeatureGroups(world);

  rankCells(world);
  generateCultures(world, rng);
  expandCultures(world);
  generateBurgs(world, rng);
  generateStates(world, rng);
  generateRoutes(world, rng);

  defineFeatureNames(world, rng);
  specifyRivers(world, rng);

  return world;
};

/** counts for smoke checks and UI summaries */
export const worldStats = (world: World) => ({
  gridCells: world.grid.cells.i.length,
  packCells: world.pack.cells.i.length,
  rivers: world.pack.rivers.length,
  features: world.pack.features.filter(Boolean).length,
  lakes: world.pack.features.filter(f => f?.type === "lake").length,
  islands: world.pack.features.filter(f => f?.type === "island").length,
  cultures: world.pack.cultures?.filter(c => c?.i).length ?? 0,
  states: world.pack.states?.filter(s => s?.i).length ?? 0,
  burgs: world.pack.burgs?.filter(b => b?.i).length ?? 0,
  routes: world.pack.routes?.filter(r => r?.i).length ?? 0
});
