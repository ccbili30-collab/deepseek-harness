// States: one per capital, grown by a cost-limited BFS over the pack cells.
// Adapted from Azgaar's Fantasy-Map-Generator (MIT): Math.random → Rng, global
// pack/options → explicit World; diplomacy, military, provinces and forms are
// out of scope for the geography layer.
import { each, type Rng } from "./rng.ts";
import { getCultureShort, getState } from "./names.ts";
import { FlatQueue, getMixedColor, getPolesOfInaccessibility, getRandomColor, minmax, rn } from "./utils.ts";
import type { State, World } from "./types.ts";

const createStates = (world: World, rng: Rng): State[] => {
  const states: State[] = [
    { i: 0, name: "Neutrals", type: "Generic", expansionism: 1, capital: 0, center: 0, culture: 0 }
  ];
  const each5th = each(5);
  const sizeVariety = world.config.states.sizeVariety;
  const cultures = world.pack.cultures;

  for (const burg of world.pack.burgs) {
    if (!burg.i || !burg.capital) continue;

    const expansionism = rn(rng() * sizeVariety + 1, 1);
    const basename =
      (burg.name?.length ?? 99) < 9 && each5th(burg.cell)
        ? burg.name!
        : world.namer?.burg(rng, burg.culture!, true) ?? getCultureShort(rng, cultures, burg.culture!);
    const name = world.config.names ? world.namer?.state(rng, basename, burg.culture!) ?? getState(rng, cultures, basename, burg.culture!) : "";
    const type = cultures[burg.culture!].type;
    states.push({
      i: burg.i,
      name,
      expansionism,
      capital: burg.i,
      type,
      center: burg.cell,
      culture: burg.culture!
    });
  }

  return states;
};

/** grow states over land cells: cheapest accumulated cost wins each cell */
export const expandStates = (world: World): void => {
  const { cells, states, cultures, burgs } = world.pack;

  cells.state = cells.state || new Uint16Array(cells.i.length);

  type Item = { e: number; p: number; s: number; b: number };
  const queue = new FlatQueue<Item>();
  const cost: number[] = [];

  const growthRate = (cells.i.length / 2) * world.config.states.growthRate;

  for (const cellId of cells.i) cells.state[cellId] = 0;

  for (const state of states) {
    if (!state.i || state.removed) continue;
    const capitalCell = burgs[state.capital].cell;
    cells.state[capitalCell] = state.i;
    const cultureCenter = cultures[state.culture].center ?? state.center;
    const b = cells.biome[cultureCenter];
    queue.push({ e: state.center, p: 0, s: state.i, b }, 0);
    cost[state.center] = 1;
  }

  const getBiomeCost = (b: number, biome: number, type: string) => {
    if (b === biome) return 10;
    if (type === "Hunting") return world.pack.biomes[biome].cost * 2;
    if (type === "Nomadic" && biome > 4 && biome < 10) return world.pack.biomes[biome].cost * 3;
    return world.pack.biomes[biome].cost;
  };

  const getHeightCost = (f: { type: string } | undefined, h: number, type: string) => {
    if (type === "Lake" && f?.type === "lake") return 10;
    if (type === "Naval" && h < 20) return 300;
    if (type === "Nomadic" && h < 20) return 10000;
    if (h < 20) return 1000;
    if (type === "Highland" && h < 62) return 1100;
    if (type === "Highland") return 0;
    if (h >= 67) return 2200;
    if (h >= 44) return 300;
    return 0;
  };

  const getRiverCost = (r: number, i: number, type: string) => {
    if (type === "River") return r ? 0 : 100;
    if (!r) return 0;
    return minmax(cells.fl[i] / 10, 20, 100);
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
    const { e, p, s, b } = next;
    const { type, culture } = states[s];

    for (const neib of cells.c[e]) {
      if (cells.state[neib] && neib === states[cells.state[neib]].center) continue;

      const cultureCost = culture === cells.culture[neib] ? -9 : 100;
      const populationCost = cells.h[neib] < 20 ? 0 : cells.s[neib] ? Math.max(20 - cells.s[neib], 0) : 5000;
      const biomeCost = getBiomeCost(b, cells.biome[neib], type);
      const heightCost = getHeightCost(world.pack.features[cells.f[neib]], cells.h[neib], type);
      const riverCost = getRiverCost(cells.r[neib], neib, type);
      const typeCost = getTypeCost(cells.t[neib], type);
      const cellCost = Math.max(cultureCost + populationCost + biomeCost + heightCost + riverCost + typeCost, 0);
      const totalCost = p + 10 + cellCost / states[s].expansionism;

      if (totalCost > growthRate) continue;

      if (!cost[neib] || totalCost < cost[neib]) {
        if (cells.h[neib] >= 20) cells.state[neib] = s;
        cost[neib] = totalCost;
        queue.push({ e: neib, p: totalCost, s, b }, totalCost);
      }
    }
  }

  for (const burg of burgs) {
    if (burg.i && !burg.removed) burg.state = cells.state[burg.cell];
  }
};

/** smooth speckled borders: flip isolated cells to the majority neighbor state */
const normalizeStates = (world: World): void => {
  const { cells, burgs } = world.pack;

  for (const i of cells.i) {
    if (cells.h[i] < 20 || cells.burg[i]) continue;
    if (cells.c[i].some(c => cells.burg[c] && burgs[cells.burg[c]].capital)) continue;
    const neibs = cells.c[i].filter(c => cells.h[c] >= 20);
    const adversaries = neibs.filter(c => cells.state[c] !== cells.state[i]);
    if (adversaries.length < 2) continue;
    const buddies = neibs.filter(c => cells.state[c] === cells.state[i]);
    if (buddies.length > 2) continue;
    if (adversaries.length <= buddies.length) continue;
    cells.state[i] = cells.state[adversaries[0]];
  }
};

const getPoles = (world: World): void => {
  const getType = (cellId: number) => world.pack.cells.state[cellId];
  const poles = getPolesOfInaccessibility(world.pack, getType);

  for (const s of world.pack.states) {
    if (!s.i || s.removed) continue;
    s.pole = poles[s.i] || [0, 0];
  }
};

const findNeighbors = (world: World): void => {
  const { cells, states } = world.pack;
  const stateNeighbors: Set<number>[] = [];

  for (const s of states) {
    if (s.removed) continue;
    stateNeighbors[s.i] = new Set();
  }

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const s = cells.state[i];
    for (const c of cells.c[i]) {
      if (cells.h[c] >= 20 && cells.state[c] !== s) stateNeighbors[s]?.add(cells.state[c]);
    }
  }

  for (const s of states) {
    if (!stateNeighbors[s.i] || s.removed) continue;
    s.neighbors = Array.from(stateNeighbors[s.i]);
  }
};

const assignColors = (world: World, rng: Rng): void => {
  const colors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f"];
  const { states } = world.pack;

  for (const state of states) {
    if (!state.i || state.removed || state.lock) continue;
    state.color = colors.find(
      color => (state.neighbors ?? []).every(neib => states[neib]?.color !== color)
    );
    if (!state.color) state.color = getRandomColor(rng);
    colors.push(colors.shift() as string);
  }

  // same-colored non-neighbors still collide visually: remix repeats
  for (const c of colors) {
    const sameColored = states.filter(s => s.color === c && s.i && !s.lock);
    sameColored.forEach((state, index) => {
      if (!index) return;
      state.color = getMixedColor(rng, state.color!);
    });
  }
};

/** full entity pass: capitals became burgs in the previous step; grow states around them */
export const generateStates = (world: World, rng: Rng): void => {
  world.pack.states = createStates(world, rng);
  expandStates(world);
  normalizeStates(world);
  getPoles(world);
  findNeighbors(world);
  assignColors(world, rng);
};
