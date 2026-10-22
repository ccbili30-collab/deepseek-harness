/**
 * Deterministic terrain composition for Noven's blank film.
 *
 * The assistant writes a small, normalized TerrainSpec; this module turns it
 * into cell heights. It never evaluates model code and never depends on the
 * current map contents, so the same spec and seed produce the same coast.
 */

export type TerrainPoint = [number, number];

export type LandShape =
  | { shape: "ellipse"; center: TerrainPoint; radius: TerrainPoint | number; coast?: number; height?: number }
  | { shape: "polygon"; points: TerrainPoint[]; coast?: number; height?: number };

export interface TerrainRidge {
  path: TerrainPoint[];
  height?: number;
  width?: number;
}

export interface TerrainBasin {
  center: TerrainPoint;
  radius: TerrainPoint | number;
  depth?: number;
}

export interface TerrainPlateau {
  center: TerrainPoint;
  radius: TerrainPoint | number;
  height?: number;
}

export interface TerrainSpec {
  seed?: string;
  landRatio?: number;
  landmasses?: LandShape[];
  ridges?: TerrainRidge[];
  basins?: TerrainBasin[];
  plateaus?: TerrainPlateau[];
}

export type TerrainOperation =
  | { op: "add_landmass"; center: TerrainPoint; radius: TerrainPoint | number; height?: number }
  | { op: "add_ridge"; path: TerrainPoint[]; height?: number; width?: number }
  | { op: "carve_sea"; center: TerrainPoint; radius: TerrainPoint | number; depth?: number }
  | { op: "add_lake"; center: TerrainPoint; radius: TerrainPoint | number; depth?: number }
  | { op: "raise"; center: TerrainPoint; radius: TerrainPoint | number; amount?: number };

export interface TerrainSummary {
  landRatio: number;
  land: number;
  cells: number;
  min: number;
  max: number;
  ascii: string;
}

export interface TerrainCellGrid {
  /** Cell centres in map coordinates, indexed by cell id. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  /** Cell ids that belong to the map. */
  readonly cells: readonly number[];
  readonly width: number;
  readonly height: number;
}

const SEA_LEVEL = 20;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function radiusOf(radius: TerrainPoint | number): TerrainPoint {
  return typeof radius === "number" ? [radius, radius] : radius;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave++) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 37) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function distanceToPath(px: number, py: number, path: readonly TerrainPoint[]): number {
  let best = Infinity;
  for (let index = 0; index < path.length - 1; index++) {
    const [ax, ay] = path[index];
    const [bx, by] = path[index + 1];
    best = Math.min(best, distanceToSegment(px, py, ax, ay, bx, by));
  }
  return best;
}

function insidePolygon(px: number, py: number, points: readonly TerrainPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function shapeField(px: number, py: number, shape: LandShape): number {
  if (shape.shape === "ellipse") {
    const [rx, ry] = radiusOf(shape.radius);
    if (rx <= 0 || ry <= 0) return -1;
    return 1 - Math.hypot((px - shape.center[0]) / rx, (py - shape.center[1]) / ry);
  }
  const inside = insidePolygon(px, py, shape.points);
  const distance = shape.points.length > 1
    ? Math.min(...shape.points.map((point, index) => distanceToSegment(px, py, point[0], point[1], shape.points[(index + 1) % shape.points.length][0], shape.points[(index + 1) % shape.points.length][1])))
    : 1;
  const edge = clamp(distance / 0.18, 0, 1);
  return inside ? 1 + edge : -edge;
}

function fieldAt(px: number, py: number, spec: TerrainSpec, seed: number): number {
  let field = -1;
  for (const shape of spec.landmasses ?? []) {
    const coast = clamp(shape.coast ?? 0.5, 0, 1);
    const noise = (fbm(px * 7.5, py * 7.5, seed) - 0.5) * 2 * 0.18 * coast;
    field = Math.max(field, shapeField(px, py, shape) + noise);
  }
  return field;
}

function ridgeAt(px: number, py: number, spec: TerrainSpec): number {
  let height = 0;
  for (const ridge of spec.ridges ?? []) {
    if (ridge.path.length < 2) continue;
    const distance = distanceToPath(px, py, ridge.path);
    const width = Math.max(ridge.width ?? 0.045, 0.005);
    height += (ridge.height ?? 48) * Math.exp(-((distance / width) ** 2));
  }
  return height;
}

function basinAt(px: number, py: number, spec: TerrainSpec): number {
  let depth = 0;
  for (const basin of spec.basins ?? []) {
    const [rx, ry] = radiusOf(basin.radius);
    if (rx <= 0 || ry <= 0) continue;
    const distance = Math.hypot((px - basin.center[0]) / rx, (py - basin.center[1]) / ry);
    depth += (basin.depth ?? 24) * Math.exp(-((distance * 1.6) ** 2));
  }
  return depth;
}

function plateauAt(px: number, py: number, spec: TerrainSpec): number {
  let height = 0;
  for (const plateau of spec.plateaus ?? []) {
    const [rx, ry] = radiusOf(plateau.radius);
    if (rx <= 0 || ry <= 0) continue;
    const distance = Math.hypot((px - plateau.center[0]) / rx, (py - plateau.center[1]) / ry);
    if (distance <= 1) height = Math.max(height, plateau.height ?? 54);
  }
  return height;
}

/** Render a TerrainSpec onto the blank cell grid. Coasts use a seeded fBm field. */
export function composeTerrain(grid: TerrainCellGrid, spec: TerrainSpec): Uint8Array {
  if (grid.cells.length === 0) throw new Error("The blank grid has no cells");
  const seedText = spec.seed ?? "noven-terrain";
  let seed = 2166136261;
  for (const char of seedText) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const fields = new Map<number, number>();
  let maxField = 0;
  for (const cell of grid.cells) {
    const point = grid.points[cell];
    if (point === undefined) continue;
    const px = point.x / grid.width;
    const py = point.y / grid.height;
    const field = fieldAt(px, py, spec, seed);
    fields.set(cell, field);
    if (field > maxField) maxField = field;
  }

  const sorted = [...fields.values()].sort((a, b) => a - b);
  const ratio = clamp(spec.landRatio ?? 0.34, 0.02, 0.9);
  const targetIndex = clamp(Math.floor((1 - ratio) * sorted.length), 0, sorted.length - 1);
  const threshold = sorted[targetIndex] ?? 0;
  const heights = new Uint8Array(grid.points.length);

  for (const cell of grid.cells) {
    const point = grid.points[cell];
    const field = fields.get(cell);
    if (point === undefined || field === undefined || field <= threshold) continue;
    const px = point.x / grid.width;
    const py = point.y / grid.height;
    const inland = clamp((field - threshold) / Math.max(0.0001, maxField - threshold), 0, 1);
    let height = SEA_LEVEL + 2 + Math.pow(inland, 0.72) * 34;
    height += ridgeAt(px, py, spec);
    height = Math.max(height, plateauAt(px, py, spec));
    height -= basinAt(px, py, spec);
    heights[cell] = Math.round(clamp(height, 0, 100));
  }
  return heights;
}

/** Apply one incremental terrain operation to an existing height array. */
export function paintTerrain(grid: TerrainCellGrid, current: Uint8Array, operation: TerrainOperation): Uint8Array {
  const heights = current.slice();
  const mutate = (fn: (px: number, py: number, value: number) => number): void => {
    for (const cell of grid.cells) {
      const point = grid.points[cell];
      if (point === undefined) continue;
      heights[cell] = Math.round(clamp(fn(point.x / grid.width, point.y / grid.height, heights[cell] ?? 0), 0, 100));
    }
  };

  switch (operation.op) {
    case "add_landmass": {
      const [rx, ry] = radiusOf(operation.radius);
      const height = operation.height ?? 34;
      mutate((px, py, value) => {
        const distance = Math.hypot((px - operation.center[0]) / Math.max(rx, 0.001), (py - operation.center[1]) / Math.max(ry, 0.001));
        return distance >= 1 ? value : Math.max(value, SEA_LEVEL + 2 + height * (1 - distance));
      });
      break;
    }
    case "add_ridge": {
      mutate((px, py, value) => {
        const distance = distanceToPath(px, py, operation.path);
        const width = Math.max(operation.width ?? 0.045, 0.005);
        return value + (operation.height ?? 48) * Math.exp(-((distance / width) ** 2));
      });
      break;
    }
    case "carve_sea":
    case "add_lake": {
      const [rx, ry] = radiusOf(operation.radius);
      const depth = operation.depth ?? 24;
      mutate((px, py, value) => {
        const distance = Math.hypot((px - operation.center[0]) / Math.max(rx, 0.001), (py - operation.center[1]) / Math.max(ry, 0.001));
        return distance >= 1 ? value : value - depth * Math.exp(-((distance * 1.6) ** 2));
      });
      break;
    }
    case "raise": {
      const [rx, ry] = radiusOf(operation.radius);
      const amount = operation.amount ?? 15;
      mutate((px, py, value) => {
        const distance = Math.hypot((px - operation.center[0]) / Math.max(rx, 0.001), (py - operation.center[1]) / Math.max(ry, 0.001));
        return distance >= 1 ? value : value + amount * Math.exp(-((distance * 1.4) ** 2));
      });
      break;
    }
    default:
      throw new Error(`Unsupported terrain operation: ${String((operation as { op?: unknown }).op)}`);
  }
  return heights;
}

/** Compact terrain facts and a 32×24 land/water map for the assistant. */
export function summarizeTerrain(grid: TerrainCellGrid, heights: Uint8Array): TerrainSummary {
  let land = 0;
  let min = 100;
  let max = 0;
  const columns = 32;
  const rows = 24;
  const bins: string[][] = Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "));
  for (const cell of grid.cells) {
    const height = heights[cell] ?? 0;
    const point = grid.points[cell];
    if (point === undefined) continue;
    min = Math.min(min, height);
    max = Math.max(max, height);
    if (height >= SEA_LEVEL) land += 1;
    const column = clamp(Math.floor((point.x / grid.width) * columns), 0, columns - 1);
    const row = clamp(Math.floor((point.y / grid.height) * rows), 0, rows - 1);
    if (height >= 60) bins[row][column] = "^";
    else if (height >= SEA_LEVEL) bins[row][column] = "#";
    else if (bins[row][column] === " ") bins[row][column] = ".";
  }
  return {
    landRatio: grid.cells.length === 0 ? 0 : Math.round((land / grid.cells.length) * 1000) / 1000,
    land,
    cells: grid.cells.length,
    min: min === 100 ? 0 : min,
    max,
    ascii: bins.map(row => row.join("")).join("\n"),
  };
}
