// World model types — the serializable state every generator step reads and writes.
// Adapted from Azgaar's Fantasy-Map-Generator (MIT): the global `grid`, `pack` and
// `options` objects are replaced by explicit fields of `World`.

export type Point = [number, number];
export type TypedArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Float32Array
  | Float64Array;

// Voronoi diagram derived from cell points
export interface VoronoiCells {
  v: number[][]; // cell vertices (vertex ids)
  c: number[][]; // adjacent cells
  b: number[]; // near-border flag
  i: Uint32Array; // cell indexes
}

export interface VoronoiVertices {
  p: Point[]; // vertex coordinates
  v: number[][]; // neighboring vertices (-1 on the hull)
  c: number[][]; // adjacent cells
}

export interface GridCells extends VoronoiCells {
  h: Uint8Array; // heights [0, 100], 20 is the sea level
  t: Int8Array; // distance field: 1 = land coast, 2+ = inland, -1 = water coast, -2- = deep water
  f: Uint16Array; // feature id
  temp: Int8Array; // temperature, °C
  prec: Uint8Array; // precipitation
}

export interface GridFeature {
  i: number;
  land: boolean;
  border: boolean;
  type: FeatureType;
}

/** the initial graph: a jittered square grid of points and its Voronoi diagram */
export interface GridGraph {
  spacing: number; // distance between points before jittering
  cellsX: number; // cells in a row
  cellsY: number; // cells in a column
  boundary: Point[]; // pseudo-points along the map edge, not real cells
  points: Point[]; // jittered square grid points, one per cell
  cells: GridCells;
  vertices: VoronoiVertices;
  features: GridFeature[]; // index 0 is a placeholder, feature ids start from 1
}

export type FeatureType = "ocean" | "lake" | "island";

export interface Feature {
  i: number;
  type: FeatureType;
  land: boolean;
  border: boolean;
  cells: number;
  firstCell: number;
  vertices: number[];
  area: number;
  shoreline: number[];
  height: number;
  subtype: string; // continent/island/isle, ocean/sea/gulf, freshwater/salt/...
  group: string; // draw group hint for the renderer
  temp: number;
  flux: number;
  evaporation: number;
  name: string;

  // River related
  inlets?: number[];
  outlet?: number;
  river?: number;
  enteringFlux?: number;
  closed?: boolean;
  outCell?: number;
}

export interface PackCells extends VoronoiCells {
  p: Point[]; // cell points
  g: Uint32Array; // parent grid cell of every packed cell
  h: Uint8Array;
  t: Int8Array;
  f: Uint16Array;
  r: Uint16Array; // river id passing through cell
  fl: Uint16Array; // water flux
  conf: Uint16Array; // confluence marker (holds summed flux)
  haven: Uint32Array; // opposite water cell for coastal land cells
  harbor: Uint8Array; // number of adjacent water cells
  area: Uint16Array; // cell area
  biome: Uint8Array; // biome id
  s: Float32Array; // cell suitability score
  pop: Float32Array; // rural population points
  culture: Uint16Array; // culture id
  burg: Uint16Array; // burg id (0 = none)
  state: Uint16Array; // state id (0 = neutrals)
}

/** the repacked graph: Voronoi rebuilt from the points that matter, denser along coasts */
export interface PackGraph {
  cells: PackCells;
  vertices: VoronoiVertices;
  rivers: River[];
  features: Feature[];
  biomes: Biome[];
  cultures: Culture[]; // index 0 is the Wildlands placeholder
  burgs: Burg[]; // index 0 is a placeholder
  states: State[]; // index 0 is Neutrals
}

export type CultureType = "Generic" | "Hunting" | "Highland" | "River" | "Lake" | "Naval" | "Nomadic";

export interface Culture {
  i: number;
  name: string;
  base: number; // namebase index
  type: CultureType;
  center?: number; // cell id
  color?: string;
  expansionism?: number;
  shield?: string;
}

export interface Burg {
  i: number;
  cell: number;
  x: number;
  y: number;
  state?: number;
  culture?: number;
  name?: string;
  feature?: number;
  capital?: number;
  port?: number; // feature id of the served water body
  population?: number;
  type?: CultureType;
  lock?: boolean;
  removed?: boolean;
}

export interface State {
  i: number;
  name: string;
  type: CultureType | string;
  expansionism: number;
  capital: number; // burg id
  center: number; // cell id
  culture: number;
  color?: string;
  pole?: Point;
  neighbors?: number[];
  lock?: boolean;
  removed?: boolean;
  form?: string;
}

export interface River {
  i: number;
  source: number;
  mouth: number;
  parent: number;
  basin: number;
  length: number;
  discharge: number; // m3/s
  width: number; // mouth width in km
  widthFactor: number;
  sourceWidth: number;
  name: string;
  type: string;
  cells: number[]; // -1 marks a border exit
  points?: [number, number, number][]; // meandered [x, y, flux]
}

export interface Biome {
  i: number;
  name: string;
  color: string;
  habitability: number;
  cost: number;
}

export interface LatLonBox {
  latT: number;
  latN: number;
  latS: number;
  lonT: number;
  lonW: number;
  lonE: number;
}

/** everything a generation run needs; replaces FMG's global `options` */
export interface WorldConfig {
  seed: string;
  width: number;
  height: number;
  points: number; // requested grid cells
  mapSize: number; // % of the world the map covers
  latitude: number; // north-south shift, %
  longitude: number; // west-east shift, %
  temperature: { equator: number; northPole: number; southPole: number };
  precipitation: number; // percent of the reference rate
  winds: number[]; // prevailing wind angle per 30° latitude tier
  heightExponent: number; // height units → meters exponent
  lakeElevationLimit: number;
  resolveDepressionsSteps: number;
  cultures: { limit: number; sizeVariety: number; growthRate: number };
  states: { limit: number; sizeVariety: number; growthRate: number };
  burgs: { limit: number }; // AUTO_BURG_LIMIT = as many as the land supports
}

export interface World {
  config: WorldConfig;
  coordinates: LatLonBox; // derived from mapSize/latitude/longitude
  grid: GridGraph;
  pack: PackGraph;
}

export const DEFAULT_WORLD_CONFIG: Omit<WorldConfig, "seed"> = {
  width: 1280,
  height: 800,
  points: 10000,
  mapSize: 100,
  latitude: 50,
  longitude: 50,
  temperature: { equator: 27, northPole: -30, southPole: -15 },
  precipitation: 100,
  winds: [225, 45, 225, 315, 135, 315],
  heightExponent: 2,
  lakeElevationLimit: 20,
  resolveDepressionsSteps: 250,
  cultures: { limit: 12, sizeVariety: 4, growthRate: 1 },
  states: { limit: 18, sizeVariety: 4, growthRate: 1 },
  burgs: { limit: 1000 } // 1000 = auto, capped by land
};
