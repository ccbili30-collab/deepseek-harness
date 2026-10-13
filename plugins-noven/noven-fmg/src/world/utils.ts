// Numeric and geometry helpers shared by the generator steps.
import { color, interpolate, interpolateRainbow, scaleSequential, type Quadtree, type QuadtreeLeaf } from "d3";
import polylabel from "polylabel";
import type { Feature, PackGraph, Point, VoronoiVertices } from "./types.ts";

export const SEA_LEVEL = 20;

export const TYPED_ARRAY_MAX = {
  INT8: 127,
  UINT8: 255,
  UINT16: 65535,
  UINT32: 4294967295
};

/** round to `d` decimal places */
export const rn = (v: number, d: number = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

export const minmax = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** clamp to [0, 100] */
export const lim = (v: number) => minmax(v, 0, 100);

export const last = <T>(array: readonly T[]): T => array[array.length - 1];

export const unique = <T>(array: T[]): T[] => [...new Set(array)];

export const distanceSquared = ([x1, y1]: Point, [x2, y2]: Point) => (x1 - x2) ** 2 + (y1 - y2) ** 2;

/** graphs that carry cell heights */
interface HeightedCells {
  h: ArrayLike<number>;
}
interface HeightedGraph {
  cells: HeightedCells;
}

export const isLand = (i: number, graph: HeightedGraph) => graph.cells.h[i] >= SEA_LEVEL;
export const isWater = (i: number, graph: HeightedGraph) => graph.cells.h[i] < SEA_LEVEL;

/** clip polygon points to the graph rectangle (Sutherland–Hodgman) */
export const clipPoly = (points: Point[], graphWidth: number, graphHeight: number): Point[] => {
  if (points.length < 2) return points;
  const edges: [Point, Point][] = [
    [
      [0, 0],
      [graphWidth, 0]
    ], // top: keep y >= 0
    [
      [graphWidth, 0],
      [graphWidth, graphHeight]
    ], // right: keep x <= width
    [
      [graphWidth, graphHeight],
      [0, graphHeight]
    ], // bottom: keep y <= height
    [
      [0, graphHeight],
      [0, 0]
    ] // left: keep x >= 0
  ];

  let output = points;
  for (const [a, b] of edges) {
    const inside = ([x, y]: Point) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0;
    const intersect = (p1: Point, p2: Point): Point => {
      const d1 = (b[0] - a[0]) * (p1[1] - a[1]) - (b[1] - a[1]) * (p1[0] - a[0]);
      const d2 = (b[0] - a[0]) * (p2[1] - a[1]) - (b[1] - a[1]) * (p2[0] - a[0]);
      const t = d1 / (d1 - d2);
      return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
    };

    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn !== prevIn) output.push(intersect(prev, cur));
      if (curIn) output.push(cur);
    }
    if (!output.length) break;
  }

  return output;
};

/** round every number inside an SVG path string to `decimals` places */
export const round = (inputString: string = "", decimals: number = 1) =>
  inputString.replace(/[\d.-][\d.e-]*/g, (n: string) => rn(parseFloat(n), decimals).toString());

/**
 * Walk the vertex chain around a feature: follow each vertex to the next vertex
 * that still separates same-type cells from other-type cells.
 */
export const connectVertices = ({
  vertices,
  startingVertex,
  ofSameType,
  addToChecked,
  closeRing
}: {
  vertices: VoronoiVertices;
  startingVertex: number;
  ofSameType: (cellId: number) => boolean;
  addToChecked?: (cellId: number) => void;
  closeRing?: boolean;
}): number[] => {
  const MAX_ITERATIONS = vertices.c.length;
  const chain: number[] = [];

  let next = startingVertex;
  for (let i = 0; i === 0 || next !== startingVertex; i++) {
    const previous = chain.at(-1);
    const current = next;
    chain.push(current);

    const neibCells = vertices.c[current];
    if (addToChecked) neibCells.filter(ofSameType).forEach(addToChecked);

    const [c1, c2, c3] = neibCells.map(ofSameType);
    const [v1, v2, v3] = vertices.v[current];

    if (v1 !== previous && c1 !== c2) next = v1;
    else if (v2 !== previous && c2 !== c3) next = v2;
    else if (v3 !== previous && c1 !== c3) next = v3;

    // a hull half-edge has no opposite triangle: vertices.v holds -1 for it
    if (next < 0 || next >= vertices.c.length || next === current) break;
    if (i === MAX_ITERATIONS) break;
  }

  if (closeRing) chain.push(startingVertex);
  return chain;
};

/** all points within `radius` of (x, y), closest quadrants first */
export const findAllInQuadtree = <T extends [number, number, ...unknown[]]>(
  x: number,
  y: number,
  radius: number,
  tree: Quadtree<T>
): T[] => {
  const found: T[] = [];
  const r2 = radius * radius;

  tree.visit((node, x0, y0, x1, y1) => {
    // prune quadrants that cannot hold a point inside the radius
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
    if (dx * dx + dy * dy > r2) return true;

    if (node && !("length" in node)) {
      let leaf: QuadtreeLeaf<T> | undefined = node;
      do {
        const d = leaf.data;
        if (distanceSquared([d[0], d[1]], [x, y]) <= r2) found.push(d);
        leaf = leaf.next;
      } while (leaf);
    }
    return false;
  });

  return found;
};

/** normalize value into [0, 1] between min and max */
export const normalize = (val: number, min: number, max: number) =>
  minmax((val - min) / (max - min), 0, 1);

const VOWELS = `aeiouyɑ'əøɛœæɶɒɨɪɔɐʊɤɯаоиеёэыуюяàèìòùỳẁȁȅȉȍȕáéíóúýẃőűâêîôûŷŵäëïöüÿẅãẽĩõũỹąęįǫųāēīōūȳăĕĭŏŭǎěǐǒǔȧėȯẏẇạẹịọụỵẉḛḭṵṳ`;
export const isVowel = (c: string): boolean => VOWELS.includes(c);

export const capitalize = (inputString: string) =>
  inputString.charAt(0).toUpperCase() + inputString.slice(1);

export const getRandomColor = (rng: () => number): string =>
  (color(scaleSequential(interpolateRainbow)(rng())) as { formatHex(): string }).formatHex();

export const getMixedColor = (rng: () => number, colorToMix: string, mix = 0.2, bright = 0.3): string => {
  const c = colorToMix && colorToMix[0] === "#" ? colorToMix : getRandomColor(rng);
  const mixed = color(interpolate(c, getRandomColor(rng))(mix)) as { brighter(k: number): { formatHex(): string } };
  return mixed.brighter(bright).formatHex();
};

/** min-priority binary heap (flatqueue): push(item, priority), pop() → lowest-priority item */
export class FlatQueue<T> {
  private ids: T[] = [];
  private values: number[] = [];
  public length = 0;

  push(item: T, value: number): void {
    let i = this.length++;
    const { ids, values } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pv = values[p];
      if (value >= pv) break;
      ids[i] = ids[p];
      values[i] = pv;
      i = p;
    }
    ids[i] = item;
    values[i] = value;
  }

  pop(): T | undefined {
    if (this.length === 0) return undefined;
    const { ids, values } = this;
    const top = ids[0];
    this.length--;
    if (this.length > 0) {
      const id = (ids[0] = ids[this.length]);
      const value = (values[0] = values[this.length]);
      const half = this.length >> 1;
      let i = 0;
      while (i < half) {
        let child = 1 + (i << 1);
        const right = child + 1;
        let childId = ids[child];
        let childValue = values[child];
        if (right < this.length && values[right] < childValue) {
          child = right;
          childId = ids[child];
          childValue = values[child];
        }
        if (childValue >= value) break;
        ids[i] = childId;
        values[i] = childValue;
        i = child;
      }
      ids[i] = id;
      values[i] = value;
    }
    return top;
  }
}

type IsolineGraph = Pick<PackGraph, "cells" | "vertices" | "features">;

export type Isolines = Record<
  string,
  { polygons?: Point[][]; fill?: string; halo?: string; waterGap?: string }
>;

const getFillPath = (vertices: VoronoiVertices, vertexChain: number[]): string => {
  const points = vertexChain.map(vertexId => vertices.p[vertexId]);
  const firstPoint = points.shift();
  return `M${firstPoint} L${points.join(" ")} Z`;
};

const getBorderPath = (
  vertices: VoronoiVertices,
  vertexChain: number[],
  discontinue: (vertexId: number) => boolean
): string => {
  let discontinued = true;
  let lastOperation = "";
  const path = vertexChain.map(vertexId => {
    if (discontinue(vertexId)) {
      discontinued = true;
      return "";
    }
    const operation = discontinued ? "M" : "L";
    discontinued = false;
    lastOperation = operation;
    const command = operation === "L" && operation === lastOperation ? "" : operation;
    return ` ${command}${vertices.p[vertexId]}`;
  });
  return path.join("").trim();
};

/**
 * Walk closed vertex chains that separate cells of equal `getType` from the rest.
 * Returns per-type boundary polygons and/or SVG path strings — used for state
 * borders, territory fills and label poles.
 */
export const getIsolines = (
  { cells, vertices, features }: IsolineGraph,
  getType: (cellId: number) => string | number | null,
  options: { polygons?: boolean; fill?: boolean; halo?: boolean; waterGap?: boolean } = {}
): Isolines => {
  const isolines: Isolines = {};

  const checkedCells = new Uint8Array(cells.i.length);
  const addToChecked = (cellId: number) => {
    checkedCells[cellId] = 1;
  };
  const isChecked = (cellId: number) => checkedCells[cellId] === 1;

  for (const cellId of cells.i) {
    if (isChecked(cellId) || !getType(cellId)) continue;
    addToChecked(cellId);

    const type = getType(cellId);
    if (type === null) continue;

    const ofSameType = (cid: number) => getType(cid) === type;
    const ofDifferentType = (cid: number) => getType(cid) !== type;

    const onborderCell = cells.c[cellId].find(ofDifferentType);
    if (onborderCell === undefined) continue;

    // inner lakes of a same-type region have no isoline of their own
    const feature = features[cells.f[onborderCell]] as Feature | undefined;
    if (feature?.type === "lake" && feature.shoreline?.every(ofSameType)) continue;

    const startingVertex = cells.v[cellId].find(v => vertices.c[v].some(ofDifferentType));
    if (startingVertex === undefined) throw new Error(`Starting vertex for cell ${cellId} is not found`);

    const vertexChain = connectVertices({
      vertices,
      startingVertex,
      ofSameType,
      addToChecked,
      closeRing: true
    });
    if (vertexChain.length < 3) continue;

    if (!isolines[type]) isolines[type] = {};
    const entry = isolines[type];

    if (options.polygons) {
      entry.polygons = entry.polygons || [];
      entry.polygons.push(vertexChain.map(vertexId => vertices.p[vertexId]));
    }
    if (options.fill) entry.fill = (entry.fill || "") + getFillPath(vertices, vertexChain);
    if (options.waterGap) {
      const isLandVertex = (vertexId: number): boolean =>
        vertices.c[vertexId].every(i => cells.h[i] >= SEA_LEVEL);
      entry.waterGap = (entry.waterGap || "") + getBorderPath(vertices, vertexChain, isLandVertex);
    }
    if (options.halo) {
      const isBorderVertex = (vertexId: number): boolean =>
        vertices.c[vertexId].some(i => cells.b[i]);
      entry.halo = (entry.halo || "") + getBorderPath(vertices, vertexChain, isBorderVertex);
    }
  }

  return isolines;
};

/** pole of inaccessibility per type id — best spot for a territory label */
export const getPolesOfInaccessibility = (
  graph: IsolineGraph,
  getType: (cellId: number) => string | number
): Record<string, Point> => {
  const isolines = getIsolines(graph, getType, { polygons: true });

  const poles = Object.entries(isolines).map(([id, isoline]) => {
    const multiPolygon = (isoline.polygons as unknown as number[][][]).sort((a, b) => b.length - a.length);
    const [x, y] = polylabel(multiPolygon, 20);
    return [id, [rn(x), rn(y)] as Point];
  });

  return Object.fromEntries(poles);
};
