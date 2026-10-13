// River polyline interpolation: insert meander points between cell anchors and
// relax acute corners. Ported from Azgaar's Fantasy-Map-Generator (MIT).
import type { Point } from "./types.ts";

/** snap a point to the closest edge of the [0,width]×[0,height] rectangle */
export const projectToNearestEdge = (point: Point, width: number, height: number): Point => {
  const [x, y] = point;
  const minDist = Math.min(y, height - y, x, width - x);
  if (minDist === y) return [x, 0];
  if (minDist === height - y) return [x, height];
  if (minDist === x) return [0, y];
  return [width, y];
};

type MeanderOptions = {
  anchors?: Point[];
  meandering?: number;
  startStep?: number;
  cellCount?: number;
  isWaterCell?: boolean[];
  bounds?: { width: number; height: number };
};

const WATER_MEANDER_SCALE = 0.25;
const RELAX_ITERATIONS = 4;

export const meander = (cells: number[], cellPositions: Point[], options: MeanderOptions = {}) => {
  const meandering = options.meandering ?? 0.5;
  const customAnchors = options.anchors;
  const bounds = options.bounds;
  const startStep = options.startStep ?? 10;
  const cellCount = options.cellCount ?? cells.length;
  const isWaterCell = options.isWaterCell;

  const anchorPoints: Point[] = cells.map((cell, i) => {
    if (customAnchors?.[i]) return customAnchors[i];
    if (cell === -1) {
      const prevCell = cells[i - 1];
      const prev: Point = prevCell !== undefined && prevCell >= 0 ? cellPositions[prevCell] : [0, 0];
      if (!bounds) return prev;
      return projectToNearestEdge(prev, bounds.width, bounds.height);
    }
    return cellPositions[cell];
  });

  const points: Point[] = [];
  const anchorIndices: number[] = [];
  const lastStep = cells.length - 1;
  let step = startStep;

  for (let i = 0; i <= lastStep; i++, step++) {
    if (!anchorPoints[i]) continue;
    const [x1, y1] = anchorPoints[i];
    anchorIndices.push(points.length);
    points.push([x1, y1]);

    if (i === lastStep) break;

    const nextCell = cells[i + 1];
    if (nextCell === -1) continue; // boundary anchor will be emitted on next iter without interpolation

    if (!anchorPoints[i + 1]) continue;
    const [x2, y2] = anchorPoints[i + 1];
    const dist2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (dist2 <= 25 && cellCount >= 6) continue;

    let meanderVal = meandering + 1 / step + Math.max(meandering - step / 100, 0);
    if (isWaterCell && (isWaterCell[i] || isWaterCell[i + 1])) meanderVal *= WATER_MEANDER_SCALE;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const sinMeander = Math.sin(angle) * meanderVal;
    const cosMeander = Math.cos(angle) * meanderVal;

    if (step < 20 && (dist2 > 64 || (dist2 > 36 && cellCount < 5))) {
      const p1x = (x1 * 2 + x2) / 3 + -sinMeander;
      const p1y = (y1 * 2 + y2) / 3 + cosMeander;
      const p2x = (x1 + x2 * 2) / 3 + sinMeander / 2;
      const p2y = (y1 + y2 * 2) / 3 - cosMeander / 2;
      points.push([p1x, p1y], [p2x, p2y]);
    } else if (dist2 > 25 || cellCount < 6) {
      const p1x = (x1 + x2) / 2 + -sinMeander;
      const p1y = (y1 + y2) / 2 + cosMeander;
      points.push([p1x, p1y]);
    }
  }

  relaxAcuteAngles(points, anchorIndices);
  return { points, anchorIndices };
};

function cornerCos(a: Point, b: Point, c: Point): number {
  const ax = a[0] - b[0];
  const ay = a[1] - b[1];
  const cx = c[0] - b[0];
  const cy = c[1] - b[1];
  const la = Math.hypot(ax, ay);
  const lc = Math.hypot(cx, cy);
  if (la === 0 || lc === 0) return -1;
  return (ax * cx + ay * cy) / (la * lc);
}

function reflectAcrossLine(m: Point, P: Point, Q: Point): Point {
  const dx = Q[0] - P[0];
  const dy = Q[1] - P[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [m[0], m[1]];
  const t = ((m[0] - P[0]) * dx + (m[1] - P[1]) * dy) / len2;
  const footX = P[0] + t * dx;
  const footY = P[1] + t * dy;
  return [2 * footX - m[0], 2 * footY - m[1]];
}

function relaxAcuteAngles(points: Point[], anchorIndices: number[]): void {
  const n = points.length;
  if (n < 3) return;

  const isAnchor = new Uint8Array(n);
  for (const idx of anchorIndices) isAnchor[idx] = 1;

  // the two anchors bounding each meander point define its segment baseline
  const prevAnchor = new Int32Array(n).fill(-1);
  const nextAnchor = new Int32Array(n).fill(-1);
  for (let i = 0, last = -1; i < n; i++) {
    prevAnchor[i] = last;
    if (isAnchor[i]) last = i;
  }
  for (let i = n - 1, last = -1; i >= 0; i--) {
    nextAnchor[i] = last;
    if (isAnchor[i]) last = i;
  }

  const acuteCost = (pos: (k: number) => Point, i: number): number => {
    if (i <= 0 || i >= n - 1) return 0;
    const cos = cornerCos(pos(i - 1), pos(i), pos(i + 1));
    return cos > 0 ? cos : 0;
  };

  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    const snapshot = points.map(p => [p[0], p[1]] as Point);
    const at = (k: number) => snapshot[k];
    let flippedAny = false;

    for (let i = 1; i < n - 1; i++) {
      if (isAnchor[i]) continue; // never move a real control point
      const p = prevAnchor[i];
      const q = nextAnchor[i];
      if (p < 0 || q < 0) continue;

      const flipped = reflectAcrossLine(snapshot[i], snapshot[p], snapshot[q]);
      const withFlip = (k: number) => (k === i ? flipped : snapshot[k]);

      const before = acuteCost(at, i - 1) + acuteCost(at, i) + acuteCost(at, i + 1);
      const after = acuteCost(withFlip, i - 1) + acuteCost(withFlip, i) + acuteCost(withFlip, i + 1);

      if (after < before - 1e-6) {
        points[i][0] = flipped[0];
        points[i][1] = flipped[1];
        flippedAny = true;
      }
    }

    if (!flippedAny) break; // converged
  }
}
