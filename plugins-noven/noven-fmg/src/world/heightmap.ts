// The heightmap layer: every input to the pipeline lands here as per-cell heights.
// Ported from Azgaar's Fantasy-Map-Generator (MIT); the module instance, DOM canvas
// and global `Math.random` patch are replaced by an explicit session object.
import { leastIndex, mean, range as d3Range } from "d3";
import type { GridGraph } from "./types.ts";
import type { Rng } from "./rng.ts";
import { getNumberInRange, P, rand } from "./rng.ts";
import { lim, minmax } from "./utils.ts";
import { findCell } from "./grid.ts";
import { heightmapTemplates } from "./templates.ts";

type Tool = "Hill" | "Pit" | "Range" | "Trough" | "Strait" | "Mask" | "Invert" | "Add" | "Multiply" | "Smooth";

const getBlobPower = (cells: number): number => {
  const blobPowerMap: Record<number, number> = {
    1000: 0.93,
    2000: 0.95,
    5000: 0.97,
    10000: 0.98,
    20000: 0.99,
    30000: 0.991,
    40000: 0.993,
    50000: 0.994,
    60000: 0.995,
    70000: 0.9955,
    80000: 0.996,
    90000: 0.9964,
    100000: 0.9973
  };
  return blobPowerMap[cells] || 0.98;
};

const getLinePower = (cells: number): number => {
  const linePowerMap: Record<number, number> = {
    1000: 0.75,
    2000: 0.77,
    5000: 0.79,
    10000: 0.81,
    20000: 0.82,
    30000: 0.83,
    40000: 0.84,
    50000: 0.86,
    60000: 0.87,
    70000: 0.88,
    80000: 0.91,
    90000: 0.92,
    100000: 0.93
  };
  return linePowerMap[cells] || 0.81;
};

export interface HeightmapGraphConfig {
  points: number;
  width: number;
  height: number;
}

/** one heightmap editing session: template steps and manual operations mutate `heights` */
export class HeightmapSession {
  heights: Uint8Array;
  private blobPower: number;
  private linePower: number;
  private width: number;
  private height: number;

  constructor(
    private rng: Rng,
    private grid: GridGraph,
    config: HeightmapGraphConfig
  ) {
    this.heights = Uint8Array.from(grid.cells.h);
    this.blobPower = getBlobPower(config.points);
    this.linePower = getLinePower(config.points);
    this.width = config.width;
    this.height = config.height;
  }

  private getPointInRange(range: string, length: number): number | undefined {
    const min = parseInt(range.split("-")[0], 10) / 100 || 0;
    const max = parseInt(range.split("-")[1], 10) / 100 || min;
    return rand(this.rng, min * length, max * length);
  }

  addHill(count: string, height: string, rangeX: string, rangeY: string): void {
    const addOneHill = () => {
      const change = new Uint8Array(this.heights.length);
      let limit = 0;
      let start: number;
      const h = lim(getNumberInRange(this.rng, height));

      do {
        const x = this.getPointInRange(rangeX, this.width);
        const y = this.getPointInRange(rangeY, this.height);
        if (x === undefined || y === undefined) return;
        start = findCell(x, y, this.grid);
        limit++;
      } while (this.heights[start] + h > 90 && limit < 50);
      change[start] = h;
      const queue = [start];
      while (queue.length) {
        const q = queue.shift() as number;

        for (const c of this.grid.cells.c[q]) {
          if (change[c]) continue;
          change[c] = change[q] ** this.blobPower * (this.rng() * 0.2 + 0.9);
          if (change[c] > 1) queue.push(c);
        }
      }

      this.heights = this.heights.map((h, i) => lim(h + change[i]));
    };

    const desiredHillCount = getNumberInRange(this.rng, count);
    for (let i = 0; i < desiredHillCount; i++) addOneHill();
  }

  addPit(count: string, height: string, rangeX: string, rangeY: string): void {
    const addOnePit = () => {
      const used = new Uint8Array(this.heights.length);
      let limit = 0;
      let start: number;
      let h = lim(getNumberInRange(this.rng, height));

      do {
        const x = this.getPointInRange(rangeX, this.width);
        const y = this.getPointInRange(rangeY, this.height);
        if (x === undefined || y === undefined) return;
        start = findCell(x, y, this.grid);
        limit++;
      } while (this.heights[start] < 20 && limit < 50);

      const queue = [start];
      while (queue.length) {
        const q = queue.shift() as number;
        h = h ** this.blobPower * (this.rng() * 0.2 + 0.9);
        if (h < 1) return;

        this.grid.cells.c[q].forEach((c: number) => {
          if (used[c]) return;
          this.heights[c] = lim(this.heights[c] - h * (this.rng() * 0.2 + 0.9));
          used[c] = 1;
          queue.push(c);
        });
      }
    };

    const desiredPitCount = getNumberInRange(this.rng, count);
    for (let i = 0; i < desiredPitCount; i++) addOnePit();
  }

  addRange(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
    startCellId?: number,
    endCellId?: number,
    randomness = 0.15
  ): void {
    const rng = this.rng;

    const addOneRange = () => {
      const getRange = (cur: number, end: number) => {
        const range = [cur];
        const p = this.grid.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          this.grid.cells.c[cur].forEach((e: number) => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            if (rng() > 1 - randomness) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(rng, height));

      if (rangeX && rangeY) {
        const startX = this.getPointInRange(rangeX, this.width) as number;
        const startY = this.getPointInRange(rangeY, this.height) as number;

        let dist = 0;
        let limit = 0;
        let endY: number;
        let endX: number;

        do {
          endX = rng() * this.width * 0.8 + this.width * 0.1;
          endY = rng() * this.height * 0.7 + this.height * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while ((dist < this.width / 8 || dist > this.width / 3) && limit < 50);

        startCellId = findCell(startX, startY, this.grid);
        endCellId = findCell(endX, endY, this.grid);
      }

      const range = getRange(startCellId as number, endCellId as number);

      let queue = range.slice();
      let i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach((i: number) => {
          this.heights[i] = lim(this.heights[i] + h * (rng() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach((f: number) => {
          this.grid.cells.c[f].forEach((i: number) => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      range.forEach((cur: number, d: number) => {
        if (d % 6 !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(this.grid.cells.c[cur], (a: number, b: number) => this.heights[a] - this.heights[b]);
          if (index === undefined) continue;
          const min = this.grid.cells.c[cur][index];
          this.heights[min] = (this.heights[cur] * 2 + this.heights[min]) / 3;
          cur = min;
        }
      });
    };

    const desiredRangeCount = getNumberInRange(rng, count);
    for (let i = 0; i < desiredRangeCount; i++) addOneRange();
  }

  addTrough(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
    startCellId?: number,
    endCellId?: number,
    randomness = 0.2
  ): void {
    const rng = this.rng;

    const addOneTrough = () => {
      const getRange = (cur: number, end: number) => {
        const range = [cur];
        const p = this.grid.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          this.grid.cells.c[cur].forEach((e: number) => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            if (rng() > 1 - randomness) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(rng, height));

      if (rangeX && rangeY) {
        let limit = 0;
        let startX: number;
        let startY: number;
        let dist = 0;
        let endX: number;
        let endY: number;
        do {
          startX = this.getPointInRange(rangeX, this.width) as number;
          startY = this.getPointInRange(rangeY, this.height) as number;
          startCellId = findCell(startX, startY, this.grid);
          limit++;
        } while (this.heights[startCellId] < 20 && limit < 50);

        limit = 0;
        do {
          endX = rng() * this.width * 0.8 + this.width * 0.1;
          endY = rng() * this.height * 0.7 + this.height * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while ((dist < this.width / 8 || dist > this.width / 2) && limit < 50);

        endCellId = findCell(endX, endY, this.grid);
      }

      const range = getRange(startCellId as number, endCellId as number);

      let queue = range.slice(),
        i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach((i: number) => {
          this.heights[i] = lim(this.heights[i] - h * (rng() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach((f: number) => {
          this.grid.cells.c[f].forEach((i: number) => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      range.forEach((cur: number, d: number) => {
        if (d % 6 !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(this.grid.cells.c[cur], (a: number, b: number) => this.heights[a] - this.heights[b]);
          if (index === undefined) continue;
          const min = this.grid.cells.c[cur][index];
          this.heights[min] = (this.heights[cur] * 2 + this.heights[min]) / 3;
          cur = min;
        }
      });
    };

    const desiredTroughCount = getNumberInRange(rng, count);
    for (let i = 0; i < desiredTroughCount; i++) addOneTrough();
  }

  addStrait(width: string, direction = "vertical"): void {
    const rng = this.rng;
    const desiredWidth = Math.min(getNumberInRange(rng, width), this.grid.cellsX / 3);
    if (desiredWidth < 1 && P(rng, desiredWidth)) return;
    const used = new Uint8Array(this.heights.length);
    const vert = direction === "vertical";
    const startX = vert ? Math.floor(rng() * this.width * 0.4 + this.width * 0.3) : 5;
    const startY = vert ? 5 : Math.floor(rng() * this.height * 0.4 + this.height * 0.3);
    const endX = vert
      ? Math.floor(this.width - startX - this.width * 0.1 + rng() * this.width * 0.2)
      : this.width - 5;
    const endY = vert
      ? this.height - 5
      : Math.floor(this.height - startY - this.height * 0.1 + rng() * this.height * 0.2);

    const start = findCell(startX, startY, this.grid);
    const end = findCell(endX, endY, this.grid);

    const getRange = (cur: number, end: number) => {
      const range = [];
      const p = this.grid.points;

      while (cur !== end) {
        let min = Infinity;
        this.grid.cells.c[cur].forEach((e: number) => {
          let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
          if (rng() > 0.8) diff = diff / 2;
          if (diff < min) {
            min = diff;
            cur = e;
          }
        });
        range.push(cur);
      }

      return range;
    };
    let range = getRange(start, end);
    const query: number[] = [];

    const step = 0.1 / desiredWidth;

    for (let i = 0; i < desiredWidth; i++) {
      const remainingWidth = desiredWidth - i;
      const exp = 0.9 - step * remainingWidth;
      range.forEach((r: number) => {
        this.grid.cells.c[r].forEach((e: number) => {
          if (used[e]) return;
          used[e] = 1;
          query.push(e);
          this.heights[e] **= exp;
          if (this.heights[e] > 100) this.heights[e] = 5;
        });
      });
      range = query.slice();
    }
  }

  modify(range: string, add: number, mult: number, power?: number): void {
    const min = range === "land" ? 20 : range === "all" ? 0 : +range.split("-")[0];
    const max = range === "land" || range === "all" ? 100 : +range.split("-")[1];
    const isLand = min === 20;

    this.heights = this.heights.map(h => {
      if (h < min || h > max) return h;

      if (add) h = isLand ? Math.max(h + add, 20) : h + add;
      if (mult !== 1) h = isLand ? (h - 20) * mult + 20 : h * mult;
      if (power) h = isLand ? (h - 20) ** power + 20 : h ** power;
      return lim(h);
    });
  }

  smooth(fr = 2, add = 0): void {
    this.heights = this.heights.map((h, i) => {
      const a = [h];
      this.grid.cells.c[i].forEach((c: number) => {
        a.push(this.heights[c]);
      });
      if (fr === 1) return (mean(a) as number) + add;
      return lim((h * (fr - 1) + (mean(a) as number) + add) / fr);
    });
  }

  mask(power = 1): void {
    const fr = power ? Math.abs(power) : 1;

    this.heights = this.heights.map((h, i) => {
      const [x, y] = this.grid.points[i];
      const nx = (2 * x) / this.width - 1; // [-1, 1], 0 is center
      const ny = (2 * y) / this.height - 1; // [-1, 1], 0 is center
      let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
      if (power < 0) distance = 1 - distance; // inverted
      const masked = h * distance;
      return lim((h * (fr - 1) + masked) / fr);
    });
  }

  invert(count: number, axes: string): void {
    if (!P(this.rng, count)) return;

    const invertX = axes !== "y";
    const invertY = axes !== "x";
    const { cellsX, cellsY } = this.grid;

    this.heights = this.heights.map((_h: number, i: number) => {
      const x = i % cellsX;
      const y = Math.floor(i / cellsX);

      const nx = invertX ? cellsX - x - 1 : x;
      const ny = invertY ? cellsY - y - 1 : y;
      const invertedI = nx + ny * cellsX;
      return this.heights[invertedI];
    });
  }

  addStep(tool: Tool, a2: string, a3: string, a4: string, a5: string): void {
    if (tool === "Hill") return this.addHill(a2, a3, a4, a5);
    if (tool === "Pit") return this.addPit(a2, a3, a4, a5);
    if (tool === "Range") return this.addRange(a2, a3, a4, a5);
    if (tool === "Trough") return this.addTrough(a2, a3, a4, a5);
    if (tool === "Strait") return this.addStrait(a2, a3);
    if (tool === "Mask") return this.mask(+a2);
    if (tool === "Invert") return this.invert(+a2, a3);
    if (tool === "Add") return this.modify(a3, +a2, 1);
    if (tool === "Multiply") return this.modify(a3, 0, +a2);
    if (tool === "Smooth") return this.smooth(+a2);
  }
}

/** run a template script and return the resulting heights */
export const heightsFromTemplate = (
  rng: Rng,
  graph: GridGraph,
  template: string,
  config: HeightmapGraphConfig
): Uint8Array => {
  const session = new HeightmapSession(rng, graph, config);
  const steps = template.split("\n");

  for (const step of steps) {
    const elements = step.trim().split(" ");
    if (elements.length < 2) throw new Error(`Heightmap template: malformed step "${step}"`);
    session.addStep(...(elements as [Tool, string, string, string, string]));
  }

  return session.heights;
};

/** resolve a template id to its script, or throw on unknown id */
export const getTemplateScript = (id: string): string => {
  const script = heightmapTemplates[id]?.template;
  if (!script) throw new Error(`Unknown heightmap template "${id}"`);
  return script;
};

/**
 * grayscale → heights: values 0–255 become heights 0–100 with FMG's power curve.
 * Use for imported DEMs and rasterized semantic drafts alike.
 */
export const heightsFromGray = (gray: ArrayLike<number>, cells: number): Uint8Array => {
  if (gray.length < cells) throw new Error(`Gray input has ${gray.length} values for ${cells} cells`);
  const heights = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    const lightness = minmax(gray[i], 0, 255) / 255;
    const powered = lightness < 0.2 ? lightness : 0.2 + (lightness - 0.2) ** 0.8;
    heights[i] = minmax(Math.floor(powered * 100), 0, 100);
  }
  return heights;
};

/** apply post-processing steps to existing heights (e.g. Smooth or Mask after a draft import) */
export const applyHeightmapSteps = (
  rng: Rng,
  graph: GridGraph,
  heights: Uint8Array,
  steps: string[],
  config: HeightmapGraphConfig
): Uint8Array => {
  const session = new HeightmapSession(rng, graph, config);
  session.heights = Uint8Array.from(heights);
  for (const step of steps) {
    const elements = step.trim().split(" ");
    session.addStep(...(elements as [Tool, string, string, string, string]));
  }
  return session.heights;
};
