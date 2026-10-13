// Town and capital placement on the suitability landscape, plus port promotion.
// Adapted from Azgaar's Fantasy-Map-Generator (MIT): Math.random → Rng, the
// global `pack`/`grid`/`options` → explicit World, routes/emblems/goods dropped.
import { quadtree } from "d3";
import { gauss, type Rng } from "./rng.ts";
import { getCulture, getCultureShort } from "./names.ts";
import { isNavigable, resolveDrainFeature, resolveLakeDrainFeature } from "./rivers.ts";
import { rn as round } from "./utils.ts";
import type { Burg, CultureType, Feature, PackGraph, Point, River, World } from "./types.ts";

const AUTO_BURG_LIMIT = 1000;
const NON_NAVIGABLE_LAKE_SUBTYPES = new Set(["dry", "frozen", "lava"]);

// A burg that could become a port on a given water body.
type PortCandidate = {
  burg: Burg;
  haven: number | null; // adjacent water cell for coastal ports; null for river ports
  portFeatureId: number;
  landFeature: number;
  preferred: boolean;
};

const getCloseToEdgePoint = (pack: PackGraph, cell1: number, cell2: number): Point => {
  const { cells, vertices } = pack;
  const [x0, y0] = cells.p[cell1];
  const commonVertices = cells.v[cell1].filter(vertex => vertices.c[vertex].some(c => c === cell2));
  const [x1, y1] = vertices.p[commonVertices[0]];
  const [x2, y2] = vertices.p[commonVertices[1]];
  const xEdge = (x1 + x2) / 2;
  const yEdge = (y1 + y2) / 2;
  return [round(x0 + 0.95 * (xEdge - x0), 2), round(y0 + 0.95 * (yEdge - y0), 2)];
};

const getRiverTangent = (pack: PackGraph, cellId: number, riversById: Map<number, River>): Point | null => {
  const river = riversById.get(pack.cells.r[cellId]);
  if (!river) return null;

  const idx = river.cells.indexOf(cellId);
  if (idx === -1) return null;

  const prevCell = river.cells[idx - 1];
  const nextCell = river.cells[idx + 1];
  const from = prevCell !== undefined && prevCell >= 0 ? pack.cells.p[prevCell] : pack.cells.p[cellId];
  const to = nextCell !== undefined && nextCell >= 0 ? pack.cells.p[nextCell] : pack.cells.p[cellId];

  const tx = to[0] - from[0];
  const ty = to[1] - from[1];
  if (tx === 0 && ty === 0) return null;
  return [tx, ty];
};

/** nudge a river burg off the river centerline onto a bank */
const shiftTowardsRiverBank = (pack: PackGraph, cellId: number, riversById: Map<number, River>): Point => {
  const { cells } = pack;
  const [x, y] = cells.p[cellId];
  const shift = Math.min(cells.fl[cellId] / 200, 0.6);

  const tangent = getRiverTangent(pack, cellId, riversById);
  if (!tangent) {
    const xShifted = cellId % 2 ? x + shift : x - shift;
    const yShifted = cells.r[cellId] % 2 ? y + shift : y - shift;
    return [round(xShifted, 2), round(yShifted, 2)];
  }

  const [tx, ty] = tangent;
  const length = Math.hypot(tx, ty);
  const side = cellId % 2 ? 1 : -1;
  return [round(x + (-ty / length) * shift * side, 2), round(y + (tx / length) * shift * side, 2)];
};

const collectPortCandidates = (world: World, burgs: Burg[]): Map<number, PortCandidate[]> => {
  const { cells } = world.pack;
  const temp = world.grid.cells.temp;

  const byWater = new Map<number, PortCandidate[]>();
  const addCandidate = (candidate: PortCandidate) => {
    if (!byWater.has(candidate.portFeatureId)) byWater.set(candidate.portFeatureId, []);
    byWater.get(candidate.portFeatureId)!.push(candidate);
  };

  for (const burg of burgs) {
    if (!burg.i || burg.lock) continue;
    const haven = cells.haven[burg.cell];
    const landFeature = cells.f[burg.cell];

    if (haven) {
      const harbor = cells.harbor[burg.cell];
      if (!harbor) continue;
      const featureId = cells.f[haven];
      const feature = world.pack.features[featureId];
      if (!feature || feature.cells <= 1) continue;
      if (NON_NAVIGABLE_LAKE_SUBTYPES.has(feature.subtype)) continue;
      if (temp[cells.g[burg.cell]] <= 0) continue; // frozen

      const portFeatureId =
        feature.type === "lake" && feature.outlet
          ? (resolveLakeDrainFeature(world.pack, featureId) ?? featureId)
          : featureId;
      const preferred = (harbor > 0 && Boolean(burg.capital)) || harbor === 1;
      addCandidate({ burg, haven, portFeatureId, landFeature, preferred });
    } else {
      if (!isNavigable(world.pack, burg.cell)) continue;
      const portFeatureId = resolveDrainFeature(world.pack, burg.cell);
      if (!portFeatureId) continue;
      addCandidate({ burg, haven: null, portFeatureId, landFeature, preferred: false });
    }
  }

  return byWater;
};

const selectPorts = (pack: PackGraph, candidates: PortCandidate[]): PortCandidate[] => {
  const { cells } = pack;
  const rank = (candidate: PortCandidate) =>
    (candidate.burg.capital ? -1000 : 0) + (candidate.haven !== null ? cells.harbor[candidate.burg.cell] : 0);

  const promoted = new Set<PortCandidate>();
  for (const c of candidates) if (c.preferred) promoted.add(c);

  const byLand = new Map<number, PortCandidate[]>();
  for (const c of candidates) {
    if (!byLand.has(c.landFeature)) byLand.set(c.landFeature, []);
    byLand.get(c.landFeature)!.push(c);
  }
  for (const group of byLand.values()) {
    if (group.some(c => promoted.has(c))) continue;
    promoted.add(group.reduce((best, c) => (rank(c) < rank(best) ? c : best)));
  }

  if (promoted.size < 2) {
    const rest = candidates.filter(c => !promoted.has(c)).sort((a, b) => rank(a) - rank(b));
    for (const c of rest) {
      promoted.add(c);
      if (promoted.size >= 2) break;
    }
  }

  if (promoted.size < 2) return []; // a lone port serves no route
  return [...promoted];
};

const assignPorts = (world: World): void => {
  const { cells, burgs } = world.pack;
  const riversById = new Map(world.pack.rivers.map(river => [river.i, river]));

  for (const burg of burgs) {
    if (burg.i && !burg.lock) delete burg.port;
  }

  const candidatesByWater = collectPortCandidates(world, burgs);
  for (const candidates of candidatesByWater.values()) {
    if (!candidates.length) continue;
    for (const candidate of selectPorts(world.pack, candidates)) {
      const { burg, haven, portFeatureId } = candidate;
      burg.port = portFeatureId;
      const [x, y] =
        haven !== null
          ? getCloseToEdgePoint(world.pack, burg.cell, haven)
          : shiftTowardsRiverBank(world.pack, burg.cell, riversById);
      burg.x = x;
      burg.y = y;
    }
  }

  // non-port river burgs still sit on a bank, not on the centerline
  for (const burg of burgs) {
    if (!burg.i || burg.lock || burg.port || !cells.r[burg.cell]) continue;
    const [x, y] = shiftTowardsRiverBank(world.pack, burg.cell, riversById);
    burg.x = x;
    burg.y = y;
  }
};

/** burg's local culture flavor from its geography (used for emblem type in FMG; kept for selection info) */
export const getBurgType = (world: World, cellId: number, port?: number): CultureType => {
  const { cells, features } = world.pack;

  if (port) return "Naval";
  const haven = cells.haven[cellId];
  if (haven !== undefined && features[cells.f[haven]].type === "lake") return "Lake";
  if (cells.h[cellId] > 60) return "Highland";
  if (cells.r[cellId] && cells.fl[cellId] >= 100) return "River";

  const biome = cells.biome[cellId];
  const population = cells.pop[cellId];
  if (!cells.burg[cellId] || population <= 5) {
    if (population < 5 && [1, 2, 3, 4].includes(biome)) return "Nomadic";
    if (biome > 4 && biome < 10) return "Hunting";
  }

  return "Generic";
};

/** place capitals and towns on the suitability landscape */
export const generateBurgs = (world: World, rng: Rng): void => {
  const { cells } = world.pack;

  let burgs: Burg[] = [0 as unknown as Burg];
  cells.burg = new Uint16Array(cells.i.length);

  const populatedCells = cells.i.filter(i => cells.s[i] > 0 && cells.culture[i]);
  if (!populatedCells.length) {
    world.pack.burgs = burgs;
    return;
  }

  let burgsQuadtree = quadtree<Point>();

  const getCapitalsNumber = () => {
    let number = world.config.states.limit;
    if (populatedCells.length < number * 10) number = Math.floor(populatedCells.length / 10);
    return number;
  };

  const getTownsNumber = () => {
    if (world.config.burgs.limit === AUTO_BURG_LIMIT)
      return Math.round(populatedCells.length / 5 / (world.grid.points.length / 10000) ** 0.8);
    return Math.min(world.config.burgs.limit, populatedCells.length);
  };

  const generateCapitals = () => {
    const score = new Float32Array(cells.s.map(v => v * (0.5 + rng() * 0.5)));
    const sorted = [...populatedCells].sort((a, b) => score[b] - score[a]);

    const capitalsNumber = getCapitalsNumber();
    let spacing = (world.config.width + world.config.height) / 2 / capitalsNumber;

    for (let i = 0; burgs.length <= capitalsNumber; i++) {
      const cell = sorted[i];
      const [x, y] = cells.p[cell];

      if (burgsQuadtree.find(x, y, spacing) === undefined) {
        burgs.push({ cell, x, y, i: burgs.length });
        burgsQuadtree.add([x, y]);
      }

      if (i === sorted.length - 1) {
        burgsQuadtree = quadtree();
        i = -1;
        burgs = [0 as unknown as Burg];
        spacing /= 1.2;
      }
    }

    burgs.forEach((burg, burgId) => {
      if (!burgId) return;
      burg.i = burgId;
      burg.state = burgId;
      burg.culture = cells.culture[burg.cell];
      if (world.config.names) burg.name = getCultureShort(rng, world.pack.cultures, burg.culture);
      burg.feature = cells.f[burg.cell];
      burg.capital = 1;
      cells.burg[burg.cell] = burgId;
    });
  };

  const generateTowns = () => {
    const score = new Float32Array(cells.s.map(v => v * gauss(rng, 1, 3, 0, 20, 3)));
    const sorted = [...populatedCells].sort((a, b) => score[b] - score[a]);

    const burgsNumber = getTownsNumber();
    let spacing =
      ((world.config.width + world.config.height) / 150) / (burgsNumber ** 0.7 / 66);

    for (let added = 0; added < burgsNumber && spacing > 1; ) {
      for (let i = 0; added < burgsNumber && i < sorted.length; i++) {
        if (cells.burg[sorted[i]]) continue;
        const cell = sorted[i];
        const [x, y] = cells.p[cell];

        const minSpacing = spacing * gauss(rng, 1, 0.3, 0.2, 2, 2);
        if (burgsQuadtree.find(x, y, minSpacing) !== undefined) continue;

        const burgId = burgs.length;
        const culture = cells.culture[cell];
        burgs.push({
          cell,
          x,
          y,
          i: burgId,
          state: 0,
          culture,
          ...(world.config.names ? { name: getCulture(rng, world.pack.cultures, culture) } : {}),
          feature: cells.f[cell],
          capital: 0
        });
        added++;
        cells.burg[cell] = burgId;
      }
      spacing *= 0.5;
    }
  };

  generateCapitals();
  generateTowns();

  world.pack.burgs = burgs;
  assignPorts(world);

  for (const burg of world.pack.burgs) {
    if (!burg || !burg.i) continue;
    const cellId = burg.cell;
    let population = cells.s[cellId] / 5;
    if (burg.capital) population *= 1.5;
    population *= gauss(rng, 1, 1, 0.25, 4, 5);
    population += ((burg.i % 100) - (cellId % 100)) / 1000;
    burg.population = round(Math.max(population, 0.01), 3);
    burg.type = getBurgType(world, cellId, burg.port);
  }
};
