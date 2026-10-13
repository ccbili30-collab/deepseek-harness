// The initial graph: a jittered square grid of points.
// Ported from Azgaar's Fantasy-Map-Generator (MIT); the module instance and the
// global `grid`/`options` are replaced by explicit parameters.
import type { GridGraph, Point } from "./types.ts";
import type { Rng } from "./rng.ts";
import { rn } from "./utils.ts";
import { calculateVoronoi } from "./voronoi.ts";

/** distance between points before jittering, derived from the requested cell count */
const getSpacing = (cellsDesired: number, width: number, height: number): number =>
  rn(Math.sqrt((width * height) / cellsDesired), 2);

/** number of cells fitting the given map dimension */
const getCellsCount = (spacing: number, size: number): number =>
  Math.floor((size + 0.5 * spacing - 1e-10) / spacing);

/** deterministic grid dimensions for a config — call before rasterizing heights inputs */
export const getGridDims = (width: number, height: number, cellsDesired: number): { cellsX: number; cellsY: number } => {
  const spacing = getSpacing(cellsDesired, width, height);
  return { cellsX: getCellsCount(spacing, width), cellsY: getCellsCount(spacing, height) };
};

/** pseudo-points along the map edge: they clip the outer Voronoi cells but get no cells */
const getBoundaryPoints = (width: number, height: number, spacing: number): Point[] => {
  const offset = rn(-1 * spacing);
  const bSpacing = spacing * 2;
  const w = width - offset * 2;
  const h = height - offset * 2;
  const numberX = Math.ceil(w / bSpacing) - 1;
  const numberY = Math.ceil(h / bSpacing) - 1;
  const points: Point[] = [];

  for (let i = 0.5; i < numberX; i++) {
    const x = Math.ceil((w * i) / numberX + offset);
    points.push([x, offset], [x, h + offset]);
  }

  for (let i = 0.5; i < numberY; i++) {
    const y = Math.ceil((h * i) / numberY + offset);
    points.push([offset, y], [w + offset, y]);
  }

  return points;
};

/** points of a square grid, each one randomly shifted within its square */
const getJitteredPoints = (rng: Rng, width: number, height: number, spacing: number): Point[] => {
  const radius = spacing / 2;
  const jittering = radius * 0.9;
  const doubleJittering = jittering * 2;
  const jitter = () => rng() * doubleJittering - jittering;

  const points: Point[] = [];
  for (let y = radius; y < height; y += spacing) {
    for (let x = radius; x < width; x += spacing) {
      points.push([Math.min(rn(x + jitter(), 2), width), Math.min(rn(y + jitter(), 2), height)]);
    }
  }
  return points;
};

export const generateGrid = (rng: Rng, width: number, height: number, cellsDesired: number): GridGraph => {
  const spacing = getSpacing(cellsDesired, width, height);
  const boundary = getBoundaryPoints(width, height, spacing);
  const points = getJitteredPoints(rng, width, height, spacing);
  const { cells, vertices } = calculateVoronoi(points, boundary);

  const graph: GridGraph = {
    spacing,
    cellsX: getCellsCount(spacing, width),
    cellsY: getCellsCount(spacing, height),
    boundary,
    points,
    cells: { ...cells, h: new Uint8Array(points.length) } as GridGraph["cells"],
    vertices,
    features: []
  };

  return graph;
};

/** rebuild the Voronoi diagram of a stored graph: saved state keeps only points and boundary */
export const rebuildGrid = (graph: GridGraph): void => {
  const { cells, vertices } = calculateVoronoi(graph.points, graph.boundary);
  Object.assign(graph.cells, cells);
  graph.vertices = vertices;
};

/** blank the heightmap, keeping the graph itself */
export const resetHeights = (graph: GridGraph): void => {
  graph.cells.h = new Uint8Array(graph.points.length);
};

/** cell index at the given coordinates, resolved by the regular square grid the points sit on */
export const findCell = (x: number, y: number, graph: GridGraph): number => {
  const { spacing, cellsX, cellsY } = graph;
  return Math.floor(Math.min(y / spacing, cellsY - 1)) * cellsX + Math.floor(Math.min(x / spacing, cellsX - 1));
};

/** cell indexes within the radius from the given coordinates */
export const findAll = (x: number, y: number, radius: number, graph: GridGraph): number[] => {
  const neighbors = graph.cells.c;
  const found = [findCell(x, y, graph)];
  let rings = Math.floor(radius / graph.spacing);
  if (!rings || radius === 1) return found;

  found.push(...neighbors[found[0]]);
  let frontier = neighbors[found[0]];
  while (rings > 1) {
    const next: number[] = [];
    for (const cellId of frontier) {
      for (const neighborId of neighbors[cellId]) {
        if (found.includes(neighborId)) continue;
        found.push(neighborId);
        next.push(neighborId);
      }
    }
    frontier = next;
    rings--;
  }

  return found;
};

/** cell polygon points */
export const getPolygon = (
  cellId: number,
  graph: { cells: { v: number[][] }; vertices: { p: Point[] } }
): Point[] => graph.cells.v[cellId].map(vertexId => graph.vertices.p[vertexId]);
