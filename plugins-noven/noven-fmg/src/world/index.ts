// Public surface of the world-generation engine.
export type * from "./types.ts";
export { DEFAULT_WORLD_CONFIG } from "./types.ts";
export { createRng, generateSeed } from "./rng.ts";
export { generateGrid, rebuildGrid, resetHeights, findCell, findAll, getPolygon, getGridDims } from "./grid.ts";
export {
  HeightmapSession,
  heightsFromTemplate,
  heightsFromGray,
  applyHeightmapSteps,
  getTemplateScript
} from "./heightmap.ts";
export { heightmapTemplates } from "./templates.ts";
export {
  markupGrid,
  markupPack,
  defineFeatureGroups,
  defineFeatureNames,
  LAKE_SUBTYPES,
  ISLAND_SUBTYPES,
  OCEAN_SUBTYPES
} from "./features.ts";
export {
  addDeepDepressionLakes,
  openNearSeaLakes,
  defineLakeClimateData,
  detectClosedLakes,
  cleanupLakeData,
  getLakeHeight,
  getLakeShoreline
} from "./lakes.ts";
export { deriveCoordinates, computeTemperature, computePrecipitation, getWinds } from "./climate.ts";
export { repackGraph, createPackQuadtree, findPackCell, findAllPack } from "./pack.ts";
export {
  generateRivers,
  specifyRivers,
  getRiverPath,
  MIN_FLUX_TO_FORM_RIVER,
  MIN_NAVIGABLE_FLUX
} from "./rivers.ts";
export { defineBiomes, getBiomeId } from "./biomes.ts";
export { rankCells } from "./population.ts";
export { generateCultures, expandCultures, DEFAULT_CULTURE_TYPE } from "./cultures.ts";
export { generateBurgs, getBurgType } from "./burgs.ts";
export { generateStates, expandStates } from "./states.ts";
export { generateRoutes } from "./routes.ts";
export { isNavigable, resolveDrainFeature, resolveLakeDrainFeature } from "./rivers.ts";
export { getIsolines, getPolesOfInaccessibility, FlatQueue } from "./utils.ts";
export { getBase, getBaseShort, getCulture, getCultureShort, getState, getMapName } from "./names.ts";
export { getDefaultNameBases } from "./namebases.ts";
export type { NameBase } from "./namebases.ts";
export { generateWorld, worldStats } from "./world.ts";
export type { GenerateWorldInput, HeightmapInput } from "./world.ts";
export { guessDraftLevel, rasterizeDraft } from "./draft.ts";
export { resampleWorld, regionOfPoints } from "./resample.ts";
export type { ResampleRegion, ResampledWorld } from "./resample.ts";
export { applyWorldEdits } from "./edits.ts";
export type { WorldEntityEdit } from "./edits.ts";
export type {
  DraftEntryInput,
  DraftPolyInput,
  DraftRasterOptions,
  DraftShapeInput,
  DraftStrokeInput
} from "./draft.ts";
