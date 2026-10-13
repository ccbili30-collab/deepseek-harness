// Route network: roads link capitals, trails link all burgs, searoutes link
// ports. Connectivity comes from an Urquhart graph (Delaunay minus the longest
// edge of each triangle); geometry is Dijkstra pathfinding over pack cells,
// with previously built segments kept cheap so routes merge into a network.
// Compact port of FMG's routes-generator (MIT): locked-route regeneration and
// river-run meandering are dropped — sea points follow cell/burg anchors.
import Delaunator from "delaunator";
import type { Burg, PackGraph, Point, Route, World } from "./types.ts";
import type { Rng } from "./rng.ts";
import { distanceSquared, FlatQueue, rn } from "./utils.ts";
import { isNavigable } from "./rivers.ts";

const MIN_PASSABLE_SEA_TEMP = -4;
const RIVER_TYPE_MODIFIER = 1.5;
const SHARP_ANGLE = 135;
const VERY_SHARP_ANGLE = 115;
const ROUTE_TYPE_MODIFIERS: Record<number, number> = { "-1": 0.4, "-2": 0.6, 0: 1, 1: 2, 2: 3, 3: 4, 4: 10 }; // distance-from-coast tiers

/** Dijkstra over pack cells; isExit may veto the approach direction via `current` */
const findPath = (
  start: number,
  isExit: (id: number, current?: number) => boolean,
  getCost: (current: number, next: number) => number,
  pack: PackGraph
): number[] | null => {
  if (isExit(start)) return null;
  const from: number[] = [];
  const cost: number[] = [];
  const queue = new FlatQueue<number>();
  queue.push(start, 0);
  while (queue.length) {
    const currentCost = queue.peekValue() ?? 0;
    const current = queue.pop()!;
    for (const next of pack.cells.c[current]) {
      if (isExit(next, current)) {
        from[next] = current;
        const path = [next];
        let cur = next;
        while (cur !== start) { cur = from[cur]; path.push(cur); }
        return path.reverse();
      }
      const nextCost = getCost(current, next);
      if (nextCost === Infinity) continue;
      const total = currentCost + nextCost;
      if (total >= (cost[next] ?? Infinity)) continue;
      from[next] = current;
      cost[next] = total;
      queue.push(next, total);
    }
  }
  return null;
};

/** Urquhart graph edges: Delaunay minus each triangle's longest edge → a sparse plausible network */
const calculateUrquhartEdges = (points: Point[]): [number, number][] => {
  if (points.length < 2) return [];
  if (points.length === 2) return [[0, 1]];
  const { halfedges, triangles } = Delaunator.from(points);
  const removed = new Uint8Array(triangles.length / 3);
  const score = (a: number, b: number) => distanceSquared(points[a], points[b]);
  for (let e = 0; e < triangles.length; e += 3) {
    const p01 = score(triangles[e], triangles[e + 1]);
    const p12 = score(triangles[e + 1], triangles[e + 2]);
    const p20 = score(triangles[e + 2], triangles[e]);
    removed[
      p20 > p01 && p20 > p12
        ? Math.max(e + 2, halfedges[e + 2])
        : p12 > p01 && p12 > p20
          ? Math.max(e + 1, halfedges[e + 1])
          : Math.max(e, halfedges[e])
    ] = 1;
  }
  const edges: [number, number][] = [];
  for (let e = 0; e < triangles.length; ++e) {
    if (e > halfedges[e] && !removed[e]) {
      edges.push([triangles[e], triangles[e % 3 === 2 ? e - 2 : e + 1]]);
    }
  }
  return edges;
};

interface RouteCtx {
  readonly pack: PackGraph;
  readonly connections: Map<string, boolean>;
  /** directed river-cell adjacency: rivers are passable only along their course */
  readonly riverEdges: Map<number, Set<number>>;
  readonly seaTemp: (cell: number) => number;
}

const buildRiverEdges = (pack: PackGraph): Map<number, Set<number>> => {
  const edges = new Map<number, Set<number>>();
  for (const river of pack.rivers) {
    if (river.cells === undefined || river.cells.length < 2) continue;
    for (let i = 0; i < river.cells.length - 1; i++) {
      const a = river.cells[i], b = river.cells[i + 1];
      if (a < 0 || b < 0) continue;
      if (!edges.has(a)) edges.set(a, new Set());
      if (!edges.has(b)) edges.set(b, new Set());
      edges.get(a)!.add(b);
      edges.get(b)!.add(a);
    }
  }
  return edges;
};

const landCost = (ctx: RouteCtx, current: number, next: number): number => {
  const { cells, biomes } = ctx.pack;
  if (cells.h[next] < 20) return Infinity;
  const habitability = biomes[cells.biome[next]]?.habitability ?? 0;
  if (!habitability) return Infinity;
  const distance = distanceSquared(cells.p[current], cells.p[next]);
  const habitabilityMod = 1 + Math.max(100 - habitability, 0) / 1000;
  const heightMod = 1 + Math.max(cells.h[next] - 25, 25) / 25;
  const connMod = ctx.connections.has(`${current}-${next}`) ? 0.5 : 1;
  const burgMod = cells.burg[next] ? 1 : 3;
  return distance * habitabilityMod * heightMod * connMod * burgMod;
};

const waterCost = (ctx: RouteCtx, current: number, next: number): number => {
  const { h, r, p, t } = ctx.pack.cells;
  const connMod = ctx.connections.has(`${current}-${next}`) ? 0.5 : 1;
  if (h[next] >= 20) {
    // land cell: only reachable along a navigable river's own course
    if (!isNavigable(ctx.pack, next)) return Infinity;
    if (!ctx.riverEdges.get(current)?.has(next)) return Infinity;
    return distanceSquared(p[current], p[next]) * RIVER_TYPE_MODIFIER * connMod;
  }
  if (h[current] >= 20) {
    if (r[current]) {
      if (!ctx.riverEdges.get(current)?.has(next)) return Infinity;
    } else {
      // coastal port: leave only through its haven so the route doesn't cut land
      const haven = ctx.pack.cells.haven?.[current];
      if (haven !== undefined && haven !== 0 && haven !== next) return Infinity;
    }
  }
  if (ctx.seaTemp(next) < MIN_PASSABLE_SEA_TEMP) return Infinity;
  const distance = distanceSquared(p[current], p[next]);
  const typeMod = ROUTE_TYPE_MODIFIERS[t[next]] ?? 1;
  return distance * typeMod * connMod;
};

/** ports must be approached over water — via the haven the burg was shifted towards, or along its river */
const waterExitCheck = (ctx: RouteCtx, exit: number) => (next: number, current?: number): boolean => {
  if (next !== exit) return false;
  if (current === undefined) return true;
  if (ctx.riverEdges.get(current)?.has(next)) return true;
  if (ctx.pack.cells.h[current] >= 20) return false;
  const haven = ctx.pack.cells.haven?.[exit];
  return haven === undefined || haven === 0 || current === haven;
};

/** split a found path at cells already connected: only the new legs become route objects */
const pathSegments = (ctx: RouteCtx, path: number[]): number[][] => {
  const segments: number[][] = [];
  let segment: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    const next = path[i + 1];
    const connected =
      ctx.connections.has(`${cell}-${next}`) || ctx.connections.has(`${next}-${cell}`);
    if (connected) {
      if (segment.length > 0) {
        segment.push(cell);
        segments.push(segment);
        segment = [];
      }
      continue;
    }
    segment.push(cell);
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
};

const addConnections = (ctx: RouteCtx, segment: number[]): void => {
  for (let i = 0; i + 1 < segment.length; i++) {
    ctx.connections.set(`${segment[i]}-${segment[i + 1]}`, true);
    ctx.connections.set(`${segment[i + 1]}-${segment[i]}`, true);
  }
};

const burgsBy = (pack: PackGraph, pick: (b: Burg) => number | undefined): Map<number, Burg[]> => {
  const grouped = new Map<number, Burg[]>();
  for (const b of pack.burgs) {
    if (!b?.i || b.removed) continue;
    const key = pick(b);
    if (key === undefined) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }
  return grouped;
};

const generateLegs = (ctx: RouteCtx, groups: Map<number, Burg[]>, isWater: boolean): { feature: number; cells: number[] }[] => {
  const legs: { feature: number; cells: number[] }[] = [];
  for (const [feature, burgs] of groups) {
    const edges = calculateUrquhartEdges(burgs.map(b => [b.x, b.y]));
    for (const [fromIdx, toIdx] of edges) {
      const start = burgs[fromIdx].cell;
      const exit = burgs[toIdx].cell;
      const getCost = isWater ? waterCost : landCost;
      const isExit = isWater ? waterExitCheck(ctx, exit) : (n: number) => n === exit;
      const path = findPath(start, isExit, (c, n) => getCost(ctx, c, n), ctx.pack);
      if (path === null) continue;
      for (const segment of pathSegments(ctx, path)) {
        addConnections(ctx, segment);
        legs.push({ feature, cells: segment });
      }
    }
  }
  return legs;
};

/** merge legs head-to-tail so a route's last cell chains into the next leg */
const mergeLegs = (legs: { feature: number; cells: number[]; merged?: boolean }[]): typeof legs => {
  let mergedAny = false;
  for (const leg of legs) {
    if (leg.merged) continue;
    for (const next of legs) {
      if (next.merged || next === leg) continue;
      if (next.cells[0] === leg.cells[leg.cells.length - 1]) {
        leg.cells.push(...next.cells.slice(1));
        next.merged = true;
        mergedAny = true;
      }
    }
  }
  return mergedAny ? mergeLegs(legs) : legs.filter(l => !l.merged);
};

/** route anchors: burg position where a cell hosts one, smoothed for sharp turns */
const routePoints = (ctx: RouteCtx, cells: number[], anchors: Point[]): [number, number, number][] => {
  const { pack } = ctx;
  const data = cells.map((cellId, i): [number, number, number] => [anchors[i][0], anchors[i][1], cellId]);
  for (let i = 1; i < cells.length - 1; i++) {
    if (pack.cells.burg[cells[i]]) continue;
    const [px, py] = data[i - 1];
    const [cx, cy] = data[i];
    const [nx, ny] = data[i + 1];
    const dAx = px - cx, dAy = py - cy;
    const dBx = nx - cx, dBy = ny - cy;
    const angle = Math.abs((Math.atan2(dAx * dBy - dAy * dBx, dAx * dBx + dAy * dBy) * 180) / Math.PI);
    if (angle >= SHARP_ANGLE) continue;
    const midX = (px + nx) / 2, midY = (py + ny) / 2;
    const [newX, newY] = angle < VERY_SHARP_ANGLE
      ? [rn((cx + midX * 2) / 3, 2), rn((cy + midY * 2) / 3, 2)]
      : [rn((cx + midX) / 2, 2), rn((cy + midY) / 2, 2)];
    data[i] = [newX, newY, cells[i]];
    anchors[i] = [newX, newY]; // smoothed anchors are shared across routes through this cell
  }
  return data;
};

/** anchor point inside a cell: the burg's own position if there is one */
const cellAnchor = (pack: PackGraph, cellId: number): Point => {
  const burgId = pack.cells.burg[cellId];
  if (burgId) return [pack.burgs[burgId].x, pack.burgs[burgId].y];
  return pack.cells.p[cellId];
};

/**
 * Generate the route network: main roads between capitals, trails between all
 * burgs (both per landmass), and sea routes between ports per water body.
 * Mutates `world.pack.routes`. Deterministic for a given world — rng only picks names.
 */
export function generateRoutes(world: World, _rng: Rng): void {
  const pack = world.pack;
  const gridTemp = world.grid.cells.temp;
  const ctx: RouteCtx = {
    pack,
    connections: new Map(),
    riverEdges: buildRiverEdges(pack),
    seaTemp: cell => gridTemp[pack.cells.g[cell]] ?? 0,
  };

  const capitals = burgsBy(pack, b => (b.capital ? b.feature : undefined));
  const all = burgsBy(pack, b => b.feature);
  const ports = burgsBy(pack, b => b.port);

  const roads = generateLegs(ctx, capitals, false);
  const trails = generateLegs(ctx, all, false);
  const sea = generateLegs(ctx, ports, true);

  const anchors = pack.cells.p.map((_, cellId) => cellAnchor(pack, cellId));
  const routes: Route[] = [];
  const emit = (legs: { feature: number; cells: number[] }[], group: Route["group"]): void => {
    for (const leg of mergeLegs(legs)) {
      const points = routePoints(ctx, leg.cells, anchors);
      const head = pack.burgs[pack.cells.burg[leg.cells[0]]]?.name;
      const tail = pack.burgs[pack.cells.burg[leg.cells[leg.cells.length - 1]]]?.name;
      routes.push({ i: routes.length + 1, group, feature: leg.feature, cells: leg.cells, points, name: head !== undefined && tail !== undefined ? `${head}–${tail}` : undefined });
    }
  };
  emit(roads, "roads");
  emit(trails, "trails");
  emit(sea, "searoutes");
  pack.routes = routes;
}
