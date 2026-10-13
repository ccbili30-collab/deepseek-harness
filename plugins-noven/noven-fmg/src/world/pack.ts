// The packed graph: a second Voronoi diagram built from the grid points that
// actually matter, denser along coasts. Downstream steps work on this graph.
// Ported from Azgaar's Fantasy-Map-Generator (MIT).
import { polygonArea, quadtree, type Quadtree } from "d3";
import type { PackCells, PackGraph, Point, World } from "./types.ts";
import { findAllInQuadtree, rn, SEA_LEVEL, TYPED_ARRAY_MAX } from "./utils.ts";
import { getPolygon } from "./grid.ts";
import { calculateVoronoi } from "./voronoi.ts";

/** drop deep-ocean points, split coastal cells, rebuild the Voronoi diagram */
export const repackGraph = (world: World): PackGraph => {
  const { grid } = world;
  const { cells: gridCells, points, features, spacing, boundary } = grid;
  const newCells: { p: Point[]; g: number[]; h: number[] } = { p: [], g: [], h: [] };
  const spacing2 = spacing ** 2;

  const addNewPoint = (gridCellId: number, x: number, y: number, height: number) => {
    newCells.p.push([x, y]);
    newCells.g.push(gridCellId);
    newCells.h.push(height);
  };

  for (const i of gridCells.i) {
    const height = gridCells.h[i];
    const type = gridCells.t[i];

    if (height < SEA_LEVEL && type !== -1 && type !== -2) continue; // exclude deep ocean points
    if (type === -2 && (i % 4 === 0 || features[gridCells.f[i]].type === "lake")) continue; // thin lake interiors

    const [x, y] = points[i];
    addNewPoint(i, x, y, height);

    // add additional points for cells along coast
    if (type === 1 || type === -1) {
      if (gridCells.b[i]) continue;

      for (const e of gridCells.c[i]) {
        if (i > e) continue;
        if (gridCells.t[e] !== type) continue;

        const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
        if (dist2 < spacing2) continue;
        addNewPoint(i, rn((x + points[e][0]) / 2, 1), rn((y + points[e][1]) / 2, 1), height);
      }
    }
  }

  const { cells, vertices } = calculateVoronoi(newCells.p, boundary);

  const pack: PackGraph = {
    cells: cells as PackCells, vertices, rivers: [], features: [], biomes: [],
    cultures: [], burgs: [], states: []
  };
  pack.cells.p = newCells.p;
  pack.cells.g = Uint32Array.from(newCells.g); // parent grid cell of every packed cell
  pack.cells.h = Uint8Array.from(newCells.h);
  pack.cells.area = new Uint16Array(cells.i.length).map((_, cellId) =>
    Math.min(Math.abs(polygonArea(getPolygon(cellId, pack))), TYPED_ARRAY_MAX.UINT16)
  );

  return pack;
};

/** one quadtree per cell-points array; callers cache by reference themselves */
export const createPackQuadtree = (pack: PackGraph): Quadtree<[number, number, number]> =>
  quadtree(pack.cells.p.map(([x, y], cellId) => [x, y, cellId] as [number, number, number]));

/** cell closest to the given coordinates, undefined if there is none within the radius */
export const findPackCell = (
  x: number,
  y: number,
  radius = Infinity,
  tree: Quadtree<[number, number, number]>
): number | undefined => tree.find(x, y, radius)?.[2];

/** cell indexes within the radius from the given coordinates */
export const findAllPack = (x: number, y: number, radius: number, tree: Quadtree<[number, number, number]>): number[] =>
  findAllInQuadtree(x, y, radius, tree).map(point => point[2]);
