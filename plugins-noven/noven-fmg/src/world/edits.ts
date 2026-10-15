// Entity overrides: user-authored renames/removals that survive regeneration.
// A generated world is a pure function of (seed, heightmap), so edits are stored
// on the source and re-applied after every pipeline run — matching by original
// name first, then by proximity to the recorded position.
// Stroke edits carry a normalized brush trail + radius: on replay the cells under
// the trail are reassigned to the resolved entity (or to 0/neutral when nothing
// resolves — that is the eraser). `add` creates a state/culture when no entity
// resolves, so "paint a realm onto empty land" works after a seed change too.
import type { Burg, Culture, Route, State, World } from "./types.ts";

/** one override record — mirrors MapWorldEdit in noven-cards/formats */
export interface WorldEntityEdit {
  readonly kind: "burg" | "state" | "culture" | "river" | "feature" | "route";
  /** original generated name — primary match key across regenerations */
  readonly key?: string;
  /** normalized fallback position: [0,1] fractions of map width/height */
  readonly at?: readonly [number, number];
  /** entity id within the same generation — last-resort matcher for unnamed
   *  entities whose `at` is unknown; meaningless after a seed change */
  readonly id?: number;
  readonly name?: string;
  readonly remove?: boolean;
  readonly lock?: boolean;
  /** brush trail: pts are [x/width, y/height] fractions, r a height fraction */
  readonly stroke?: { readonly pts: readonly (readonly [number, number])[]; readonly r: number };
  /** polyline for a created route (with `add`) or the replacement polyline for
   *  a resolved route: same normalization as `at` */
  readonly path?: readonly (readonly [number, number])[];
  /** burg relocation target: resolved burg re-anchors to the land cell
   *  nearest this normalized point */
  readonly move?: readonly [number, number];
  /** create the entity when resolution fails: state/culture anchor `at` (a
   *  stroke paints its cells), burg anchors `at`, route follows `path` */
  readonly add?: boolean;
  /** route group for created routes */
  readonly group?: "roads" | "trails" | "searoutes";
  readonly color?: string;
}

interface Named {
  i: number;
  name?: string;
  removed?: boolean;
  lock?: boolean;
}

const namedOf = (world: World, kind: WorldEntityEdit["kind"]): readonly Named[] => {
  switch (kind) {
    case "burg": return world.pack.burgs;
    case "state": return world.pack.states;
    case "culture": return world.pack.cultures;
    case "river": return world.pack.rivers;
    case "feature": return world.pack.features;
    case "route": return world.pack.routes;
  }
};

const posOf = (world: World, kind: WorldEntityEdit["kind"], item: Named): readonly [number, number] | undefined => {
  const pack = world.pack;
  switch (kind) {
    case "burg": {
      const b = item as Burg;
      return [b.x, b.y];
    }
    case "state": {
      const s = item as State;
      if (s.pole !== undefined) return s.pole;
      const c = s.center;
      return c !== undefined ? pack.cells.p[c] : undefined;
    }
    case "culture": {
      const cu = item as Culture;
      return cu.center !== undefined ? pack.cells.p[cu.center] : undefined;
    }
    case "river": {
      const r = item as { points?: readonly (readonly [number, number, number])[] };
      const mid = r.points?.[Math.floor(r.points.length / 2)];
      return mid !== undefined ? [mid[0], mid[1]] : undefined;
    }
    case "feature": {
      const f = item as { vertices?: readonly number[] };
      const vi = f.vertices?.[0];
      return vi !== undefined ? pack.vertices.p[vi] : undefined;
    }
    case "route": {
      const r = item as { points?: readonly (readonly [number, number, number])[] };
      const mid = r.points?.[Math.floor(r.points.length / 2)];
      return mid !== undefined ? [mid[0], mid[1]] : undefined;
    }
  }
};

const dist2ToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
};

/** cells whose centers fall within the stroke radius; land only (h >= 20) */
const cellsAlongStroke = (world: World, stroke: NonNullable<WorldEntityEdit["stroke"]>): number[] => {
  const { width: w, height: h } = world.config;
  const pts = stroke.pts.map(p => [p[0] * w, p[1] * h] as const);
  const r = stroke.r * h;
  if (pts.length === 0 || r <= 0) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cells = world.pack.cells;
  const out: number[] = [];
  for (let i = 0; i < cells.i.length; i++) {
    if ((cells.h[i] ?? 0) < 20) continue;
    const [px, py] = cells.p[i];
    if (px < x0 - r || px > x1 + r || py < y0 - r || py > y1 + r) continue;
    let hit = dist2ToSeg(px, py, pts[0][0], pts[0][1], pts[0][0], pts[0][1]) <= r * r;
    for (let s = 1; !hit && s < pts.length; s++) {
      hit = dist2ToSeg(px, py, pts[s - 1][0], pts[s - 1][1], pts[s][0], pts[s][1]) <= r * r;
    }
    if (hit) out.push(i);
  }
  return out;
};

/** nearest cell to world-pixel coordinates; landOnly skips water (h < 20) */
const nearestCell = (world: World, px: number, py: number, landOnly: boolean): number | undefined => {
  const cells = world.pack.cells;
  let best = Infinity, cell: number | undefined;
  for (let i = 0; i < cells.i.length; i++) {
    if (landOnly && (cells.h[i] ?? 0) < 20) continue;
    const [x, y] = cells.p[i];
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < best) { best = d; cell = i; }
  }
  return cell;
};

/** nearest land cell to a normalized point — anchors freshly created entities */
const nearestLandCell = (world: World, at: readonly [number, number]): number | undefined =>
  nearestCell(world, at[0] * world.config.width, at[1] * world.config.height, true);

/** deterministic pastel for user-created entities */
const freshColor = (i: number): string => `hsl(${(i * 61 + 25) % 360} 45% 62%)`;

const createEntity = (world: World, kind: "state" | "culture", edit: WorldEntityEdit): Named | undefined => {
  const anchor = edit.at ?? edit.stroke?.pts[0];
  const center = anchor !== undefined ? nearestLandCell(world, anchor) : undefined;
  if (center === undefined) return undefined;
  const i = kind === "state" ? world.pack.states.length : world.pack.cultures.length;
  const name = edit.name ?? "";
  if (kind === "state") {
    const s: State = {
      i, name, type: "Generic", expansionism: 1, capital: 0, center, culture: 0,
      color: edit.color ?? freshColor(i), pole: [...world.pack.cells.p[center]],
      ...(edit.lock === true ? { lock: true } : {}),
    };
    (world.pack.states as State[]).push(s);
    return s;
  }
  const cu: Culture = {
    i, name, base: 0, type: "Generic", center,
    color: edit.color ?? freshColor(i),
    ...(edit.lock === true ? { lock: true } : {}),
  };
  (world.pack.cultures as Culture[]).push(cu);
  return cu;
};

/** user-placed town: sits at the land cell nearest `at`, inherits that cell's
 *  state/culture; coastal cells register the port's served water feature */
const createBurg = (world: World, edit: WorldEntityEdit): Burg | undefined => {
  if (edit.at === undefined) return undefined;
  const cell = nearestLandCell(world, edit.at);
  if (cell === undefined) return undefined;
  const cells = world.pack.cells;
  const haven = cells.haven?.[cell];
  const port = (cells.harbor?.[cell] ?? 0) > 0 && haven !== undefined ? cells.f[haven] ?? 0 : 0;
  const i = world.pack.burgs.length;
  const burg: Burg = {
    i, cell, x: cells.p[cell][0], y: cells.p[cell][1],
    state: cells.state[cell] ?? 0, culture: cells.culture[cell] ?? 0,
    feature: cells.f[cell] ?? 0, capital: 0, population: 1,
    ...(port > 0 ? { port } : {}),
    ...(edit.name !== undefined && edit.name !== '' ? { name: edit.name } : {}),
    ...(edit.lock === true ? { lock: true } : {}),
  };
  (world.pack.burgs as Burg[]).push(burg);
  cells.burg[cell] = i;
  return burg;
};

/** normalized path → world-px points anchored to this generation's cells */
const routePoints = (world: World, path: readonly (readonly [number, number])[]): [number, number, number][] => {
  const { width: w, height: h } = world.config;
  return path.map(([nx, ny]) => {
    const x = nx * w, y = ny * h;
    return [x, y, nearestCell(world, x, y, false) ?? 0] as [number, number, number];
  });
};

/** relocate a burg to the land cell nearest `at`: re-register the cell index
 *  and refresh state/culture/feature/port to match the new site */
const moveBurg = (world: World, burg: Burg, at: readonly [number, number]): void => {
  const cell = nearestLandCell(world, at);
  if (cell === undefined) return;
  const cells = world.pack.cells;
  if (cells.burg[burg.cell] === burg.i) cells.burg[burg.cell] = 0;
  cells.burg[cell] = burg.i;
  burg.cell = cell;
  burg.x = cells.p[cell][0];
  burg.y = cells.p[cell][1];
  burg.state = cells.state[cell] ?? 0;
  burg.culture = cells.culture[cell] ?? 0;
  burg.feature = cells.f[cell] ?? 0;
  const haven = cells.haven?.[cell];
  burg.port = (cells.harbor?.[cell] ?? 0) > 0 && haven !== undefined ? cells.f[haven] ?? 0 : 0;
};

/** user-drawn road/trail/searoute: `path` normalized pts re-anchor to this
 *  generation's cells, so a redrawn world keeps the same drawn line */
const createRoute = (world: World, edit: WorldEntityEdit): Route | undefined => {
  const path = edit.path;
  if (path === undefined || path.length < 2) return undefined;
  const points = routePoints(world, path);
  // 生成的路线 id 从 1 起且无占位项——length 会撞上既有 id
  const i = world.pack.routes.reduce((m, r) => Math.max(m, r.i), 0) + 1;
  const route: Route = {
    i, group: edit.group ?? "roads",
    feature: world.pack.cells.f[points[0]?.[2] ?? 0] ?? 0,
    cells: points.map(p => p[2]), points,
    ...(edit.name !== undefined && edit.name !== '' ? { name: edit.name } : {}),
    ...(edit.lock === true ? { lock: true } : {}),
  };
  world.pack.routes.push(route);
  return route;
};

/**
 * Re-apply stored entity edits onto a freshly generated world.
 * Match order: same original name → nearest entity within `radius` of `at`.
 * Stroke edits reassign the cells under the trail; `add` creates the target
 * when nothing resolves; a stroke with no resolved entity resets cells to 0.
 * @returns how many edits landed on a live entity or painted cells
 */
export function applyWorldEdits(world: World, edits: readonly WorldEntityEdit[]): number {
  let applied = 0;
  const radius = world.config.height * 0.05;
  for (const edit of edits) {
    const list = namedOf(world, edit.kind);
    let target: Named | undefined;
    // add 实体只按名认领——就近匹配会把邻家生成实体错当目标；空名不匹配
    const matchName = edit.key ?? (edit.add === true ? edit.name : undefined);
    if (matchName !== undefined && matchName !== '') {
      target = list.find(e => e.removed !== true && e.name === matchName);
    }
    if (target === undefined && edit.at !== undefined && edit.add !== true) {
      const px = edit.at[0] * world.config.width;
      const py = edit.at[1] * world.config.height;
      let best = Infinity;
      for (const e of list) {
        if (e.removed === true) continue;
        const p = posOf(world, edit.kind, e);
        if (p === undefined) continue;
        const d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
        if (d < best) { best = d; target = e; }
      }
      if (best > radius * radius) target = undefined;
    }
    if (target === undefined && edit.id !== undefined) {
      target = list.find(e => e.removed !== true && e.i === edit.id);
    }
    if (target === undefined && edit.add === true) {
      if (edit.kind === "state" || edit.kind === "culture") target = createEntity(world, edit.kind, edit);
      else if (edit.kind === "burg") target = createBurg(world, edit);
      else if (edit.kind === "route") target = createRoute(world, edit);
    }
    if (edit.stroke !== undefined && (edit.kind === "state" || edit.kind === "culture")) {
      const dim = edit.kind === "state" ? world.pack.cells.state : world.pack.cells.culture;
      const assign = target?.i ?? 0;
      for (const c of cellsAlongStroke(world, edit.stroke)) dim[c] = assign;
      if (target !== undefined) {
        applied++;
        continue;
      }
      applied++;
      continue;
    }
    if (target === undefined) continue;
    // path on a resolved route rewrites its polyline; move relocates a burg —
    // both re-anchor against this generation's cells like `add` does
    if (edit.kind === "route" && edit.path !== undefined && edit.add !== true && edit.path.length >= 2) {
      const points = routePoints(world, edit.path);
      const route = target as Route;
      route.points = points;
      route.cells = points.map(p => p[2]);
      route.feature = world.pack.cells.f[points[0]?.[2] ?? 0] ?? 0;
    }
    if (edit.kind === "burg" && edit.move !== undefined) moveBurg(world, target as Burg, edit.move);
    if (edit.remove === true) target.removed = true;
    if (edit.name !== undefined && edit.add !== true) target.name = edit.name;
    if (edit.color !== undefined) (target as { color?: string }).color = edit.color;
    if (edit.lock === true) target.lock = true;
    applied++;
  }
  return applied;
}
