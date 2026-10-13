// Culture centers, typing and expansion — which name base and growth quirks
// each region of the map takes. Adapted from Azgaar's Fantasy-Map-Generator
// (MIT): the curated culture table keeps its data, sorting helpers keep their
// intent, emblems/codes/locks are dropped.
import { max, quadtree, range, color, interpolateRainbow, scaleSequential, shuffler, type Quadtree } from "d3";
import { P, rand, type Rng } from "./rng.ts";
import { FlatQueue, minmax, rn } from "./utils.ts";
import type { Culture, CultureType, World } from "./types.ts";

export const DEFAULT_CULTURE_TYPE: CultureType = "Generic";

type CultureSpec = {
  name: string;
  base: number;
  odd: number;
  sort?: (i: number) => number;
};

const C_12 = [
  "#dababf", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5",
  "#c6b9c1", "#bc80bd", "#ccebc5", "#ffed6f", "#8dd3c7", "#eb8de7"
];

const getColors = (rng: Rng, count: number): string[] => {
  const scaleRainbow = scaleSequential(interpolateRainbow);
  const shuffle = shuffler(rng);
  const colors = shuffle(
    range(count).map(i => (i < 12 ? C_12[i] : color(scaleRainbow((i - 12) / (count - 12)))?.formatHex()))
  );
  return colors.filter((c): c is string => typeof c === "string");
};

const biased = (rng: Rng, min: number, max: number, ex: number): number =>
  Math.round(min + (max - min) * rng() ** ex);

// The all-world culture set: curated name + namebase + preferred-habitat sort.
// sort helpers: n = normalized suitability, td = temperature distance fee,
// bd = biome distance fee, sf = off-sea fee, t/h read the cell.
const getDefaultCultures = (world: World): CultureSpec[] => {
  const cells = world.pack.cells;
  const sMax = max(cells.s) || 1;
  const temp = world.grid.cells.temp;
  const n = (cell: number) => Math.ceil((cells.s[cell] / sMax) * 3);
  const td = (cell: number, goal: number) => {
    const d = Math.abs(temp[cells.g[cell]] - goal);
    return d ? d + 1 : 1;
  };
  const bd = (cell: number, biomes: number[], fee = 4) =>
    biomes.includes(cells.biome[cell]) ? 1 : fee;
  const sf = (cell: number, fee = 4) =>
    cells.haven[cell] && world.pack.features[cells.f[cells.haven[cell]]].type !== "lake" ? 1 : fee;
  const t = (cell: number) => cells.t[cell];
  const h = (cell: number) => cells.h[cell];

  return [
    { name: "Shwazen", base: 0, odd: 0.7, sort: i => n(i) / td(i, 10) / bd(i, [6, 8]) },
    { name: "Angshire", base: 1, odd: 1, sort: i => n(i) / td(i, 10) / sf(i) },
    { name: "Luari", base: 2, odd: 0.6, sort: i => n(i) / td(i, 12) / bd(i, [6, 8]) },
    { name: "Tallian", base: 3, odd: 0.6, sort: i => n(i) / td(i, 15) },
    { name: "Astellian", base: 4, odd: 0.6, sort: i => n(i) / td(i, 16) },
    { name: "Slovan", base: 5, odd: 0.7, sort: i => (n(i) / td(i, 6)) * t(i) },
    { name: "Norse", base: 6, odd: 0.7, sort: i => n(i) / td(i, 5) },
    { name: "Elladan", base: 7, odd: 0.7, sort: i => (n(i) / td(i, 18)) * h(i) },
    { name: "Romian", base: 8, odd: 0.7, sort: i => n(i) / td(i, 15) },
    { name: "Soumi", base: 9, odd: 0.3, sort: i => (n(i) / td(i, 5) / bd(i, [9])) * t(i) },
    { name: "Koryo", base: 10, odd: 0.1, sort: i => n(i) / td(i, 12) / t(i) },
    { name: "Hantzu", base: 11, odd: 0.1, sort: i => n(i) / td(i, 13) },
    { name: "Yamoto", base: 12, odd: 0.1, sort: i => n(i) / td(i, 15) / t(i) },
    { name: "Portuzian", base: 13, odd: 0.4, sort: i => n(i) / td(i, 17) / sf(i) },
    { name: "Nawatli", base: 14, odd: 0.1, sort: i => h(i) / td(i, 18) / bd(i, [7]) },
    { name: "Vengrian", base: 15, odd: 0.2, sort: i => (n(i) / td(i, 11) / bd(i, [4])) * t(i) },
    { name: "Turchian", base: 16, odd: 0.2, sort: i => n(i) / td(i, 13) },
    { name: "Amazi", base: 17, odd: 0.1, sort: i => (n(i) / td(i, 19) / bd(i, [1, 2, 3], 7)) * t(i) },
    { name: "Eurabic", base: 18, odd: 0.2, sort: i => (n(i) / td(i, 26) / bd(i, [1, 2], 7)) * t(i) },
    { name: "Inuk", base: 19, odd: 0.05, sort: i => td(i, -1) / bd(i, [10, 11]) / sf(i) },
    { name: "Euskati", base: 20, odd: 0.05, sort: i => (n(i) / td(i, 15)) * h(i) },
    { name: "Yoruba", base: 21, odd: 0.05, sort: i => n(i) / td(i, 15) / bd(i, [5, 7]) },
    { name: "Keltan", base: 22, odd: 0.05, sort: i => (n(i) / td(i, 11) / bd(i, [6, 8])) * t(i) },
    { name: "Efratic", base: 23, odd: 0.05, sort: i => (n(i) / td(i, 22)) * t(i) },
    { name: "Tehrani", base: 24, odd: 0.1, sort: i => (n(i) / td(i, 18)) * h(i) },
    { name: "Maui", base: 25, odd: 0.05, sort: i => n(i) / td(i, 24) / sf(i) / t(i) },
    { name: "Carnatic", base: 26, odd: 0.05, sort: i => n(i) / td(i, 26) },
    { name: "Inqan", base: 27, odd: 0.05, sort: i => h(i) / td(i, 13) },
    { name: "Kiswaili", base: 28, odd: 0.1, sort: i => n(i) / td(i, 29) / bd(i, [1, 3, 5, 7]) },
    { name: "Vietic", base: 29, odd: 0.1, sort: i => n(i) / td(i, 25) / bd(i, [7], 7) / t(i) },
    { name: "Guantzu", base: 30, odd: 0.1, sort: i => n(i) / td(i, 17) },
    { name: "Ulus", base: 31, odd: 0.1, sort: i => (n(i) / td(i, 5) / bd(i, [2, 4, 10], 7)) * t(i) },
    { name: "Levent", base: 42, odd: 0.2, sort: i => (n(i) / td(i, 18)) * sf(i) }
  ];
};

const defineCultureType = (world: World, rng: Rng, i: number): CultureType => {
  const cells = world.pack.cells;
  if (cells.h[i] < 70 && [1, 2, 4].includes(cells.biome[i])) return "Nomadic";
  if (cells.h[i] > 50) return "Highland";
  const f = world.pack.features[cells.f[cells.haven[i]]];
  if (f.type === "lake" && f.cells > 5) return "Lake";
  if (
    (cells.harbor[i] && f.type !== "lake" && P(rng, 0.1)) ||
    (cells.harbor[i] === 1 && P(rng, 0.6)) ||
    (world.pack.features[cells.f[i]].subtype === "isle" && P(rng, 0.4))
  )
    return "Naval";
  if (cells.r[i] && cells.fl[i] > 100) return "River";
  if (cells.t[i] > 2 && [3, 7, 8, 9, 10, 12].includes(cells.biome[i])) return "Hunting";
  return DEFAULT_CULTURE_TYPE;
};

const defineCultureExpansionism = (rng: Rng, type: CultureType, sizeVariety: number) => {
  let base = 1;
  if (type === "Lake") base = 0.8;
  else if (type === "Naval") base = 1.5;
  else if (type === "River") base = 0.9;
  else if (type === "Nomadic") base = 1.5;
  else if (type === "Hunting") base = 0.7;
  else if (type === "Highland") base = 1.2;
  return rn(((rng() * sizeVariety) / 2 + 1) * base, 1);
};

/** place culture centers on populated cells and assign type/expansionism */
export const generateCultures = (world: World, rng: Rng): void => {
  const cells = world.pack.cells;
  const cultureIds = new Uint16Array(cells.i.length);

  let count = Math.min(world.config.cultures.limit, 32);
  const populated = cells.i.filter(i => cells.s[i]);

  if (populated.length < count * 25) {
    count = Math.floor(populated.length / 50);
    if (!count) {
      // harsh world: nobody lives here
      world.pack.cultures = [{ i: 0, name: "Wildlands", base: 1, type: DEFAULT_CULTURE_TYPE }];
      cells.culture = cultureIds;
      return;
    }
  }

  const spec = getDefaultCultures(world);
  const selected: CultureSpec[] = [];
  const pool = [...spec];
  for (let i = 0; selected.length < count && pool.length > 0; i++) {
    let rnd = 0;
    let culture: CultureSpec | undefined;
    do {
      rnd = rand(rng, pool.length - 1);
      culture = pool[rnd];
      i++;
    } while (i < 200 && !P(rng, culture.odd));
    selected.push(culture);
    pool.splice(rnd, 1);
  }

  const centers: Quadtree<[number, number]> = quadtree();
  const colors = getColors(rng, selected.length);

  const placeCenter = (sortingFn: (i: number) => number): number => {
    let spacing = (world.config.width + world.config.height) / 2 / count;
    const sorted = [...populated].sort((a, b) => sortingFn(b) - sortingFn(a));
    const half = Math.floor(sorted.length / 2);

    let cellId = sorted[0] ?? 0;
    for (let i = 0; i < 100; i++) {
      cellId = sorted[biased(rng, 0, half, 5)];
      spacing *= 0.9;
      const p = cells.p[cellId];
      if (!cultureIds[cellId] && !centers.find(p[0], p[1], spacing)) break;
    }
    return cellId;
  };

  const cultures: Culture[] = [];
  selected.forEach((c, i) => {
    const center = placeCenter(c.sort ?? (id => cells.s[id]));
    centers.add(cells.p[center]);
    cultureIds[center] = i + 1;
    const type = defineCultureType(world, rng, center);
    cultures.push({
      i: i + 1,
      name: world.config.names ? c.name : "",
      base: c.base,
      type,
      center,
      color: colors[i],
      expansionism: defineCultureExpansionism(rng, type, world.config.cultures.sizeVariety)
    });
  });

  cultures.unshift({ i: 0, name: "Wildlands", base: 1, type: DEFAULT_CULTURE_TYPE });
  world.pack.cultures = cultures;
  cells.culture = cultureIds;
};

/** cost-based expansion: assign every populated cell to the reaching culture */
export const expandCultures = (world: World): void => {
  const { cells, cultures } = world.pack;

  const queue = new FlatQueue<{ cellId: number; cultureId: number; priority: number }>();
  const cost: number[] = [];
  const maxExpansionCost = cells.i.length * 0.6 * world.config.cultures.growthRate;

  cells.culture = new Uint16Array(cells.i.length);

  for (const culture of cultures) {
    if (!culture.i) continue;
    queue.push({ cellId: culture.center!, cultureId: culture.i, priority: 0 }, 0);
  }

  const getBiomeCost = (c: number, biome: number, type: string) => {
    if (cells.biome[cultures[c].center!] === biome) return 10;
    if (type === "Hunting") return world.pack.biomes[biome].cost * 5;
    if (type === "Nomadic" && biome > 4 && biome < 10) return world.pack.biomes[biome].cost * 10;
    return world.pack.biomes[biome].cost * 2;
  };

  const getHeightCost = (i: number, h: number, type: string) => {
    const f = world.pack.features[cells.f[i]];
    const a = cells.area[i];
    if (type === "Lake" && f.type === "lake") return 10;
    if (type === "Naval" && h < 20) return a * 2;
    if (type === "Nomadic" && h < 20) return a * 50;
    if (h < 20) return a * 6;
    if (type === "Highland" && h < 44) return 3000;
    if (type === "Highland" && h < 62) return 200;
    if (type === "Highland") return 0;
    if (h >= 67) return 200;
    if (h >= 44) return 30;
    return 0;
  };

  const getRiverCost = (riverId: number, cellId: number, type: string) => {
    if (type === "River") return riverId ? 0 : 100;
    if (!riverId) return 0;
    return minmax(cells.fl[cellId] / 10, 20, 100);
  };

  const getTypeCost = (t: number, type: string) => {
    if (t === 1) return type === "Naval" || type === "Lake" ? 0 : type === "Nomadic" ? 60 : 20;
    if (t === 2) return type === "Naval" || type === "Nomadic" ? 30 : 0;
    if (t !== -1) return type === "Naval" || type === "Lake" ? 100 : 0;
    return 0;
  };

  while (queue.length) {
    const next = queue.pop();
    if (!next) break;
    const { cellId, priority, cultureId } = next;
    const { type, expansionism } = cultures[cultureId];
    const sourceBiome = cells.biome[cellId];

    cells.c[cellId].forEach(neibCellId => {
      const targetBiome = cells.biome[neibCellId];
      const biomeCost = getBiomeCost(cultureId, targetBiome, type);
      const biomeChangeCost = sourceBiome === targetBiome ? 0 : 20;
      const heightCost = getHeightCost(neibCellId, cells.h[neibCellId], type);
      const riverCost = getRiverCost(cells.r[neibCellId], neibCellId, type);
      const typeCost = getTypeCost(cells.t[neibCellId], type);
      const cellCost = (biomeCost + biomeChangeCost + heightCost + riverCost + typeCost) / (expansionism || 1);
      const totalCost = priority + cellCost;

      if (totalCost > maxExpansionCost) return;

      if (!cost[neibCellId] || totalCost < cost[neibCellId]) {
        if (cells.pop[neibCellId] > 0) cells.culture[neibCellId] = cultureId;
        cost[neibCellId] = totalCost;
        queue.push({ cellId: neibCellId, cultureId, priority: totalCost }, totalCost);
      }
    });
  }
};
