// Entity overrides: user-authored renames/removals that survive regeneration.
// A generated world is a pure function of (seed, heightmap), so edits are stored
// on the source and re-applied after every pipeline run — matching by original
// name first, then by proximity to the recorded position.
import type { Burg, Culture, State, World } from "./types.ts";

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

/**
 * Re-apply stored entity edits onto a freshly generated world.
 * Match order: same original name → nearest entity within `radius` of `at`.
 * @returns how many edits landed on a live entity
 */
export function applyWorldEdits(world: World, edits: readonly WorldEntityEdit[]): number {
  let applied = 0;
  const radius = world.config.height * 0.05;
  for (const edit of edits) {
    const list = namedOf(world, edit.kind);
    let target: Named | undefined;
    if (edit.key !== undefined) {
      target = list.find(e => e.removed !== true && e.name === edit.key);
    }
    if (target === undefined && edit.at !== undefined) {
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
    if (target === undefined) continue;
    if (edit.remove === true) target.removed = true;
    if (edit.name !== undefined) target.name = edit.name;
    if (edit.lock === true) target.lock = true;
    applied++;
  }
  return applied;
}
