/**
 * Host bridge for embedding the editor in Noven.
 *
 * The map is the upstream `.map` payload (the string Save.prepareMapData
 * produces). The host loads a card's map through `load` and persists the
 * current map through `save`; no file picker or browser download is needed.
 */
import { fitMapToScreen } from "@/components/canvas";
import { Layers } from "@/components/layers";
import { generate, generateHuman, restoreBlankOptions, startBlank } from "@/components/lifecycle";
import { resetZoom } from "@/components/zoom";
import { Proposals } from "@/controllers/assistant/proposals";
import { composeTerrain as renderTerrainSpec, paintTerrain as paintTerrainStep, summarizeTerrain, type TerrainOperation, type TerrainSpec, type TerrainSummary } from "@/generators/terrain-composer";
import { HeightmapEditor } from "@/controllers/heightmap-editor";
import { loadMapData } from "@/services/io/load";
import { Save } from "@/services/io/save";
import { VERSION } from "@/services/versioning";

type MapOperation = { op: string; args: unknown[] };

type MapSummary = {
  seed: string;
  width: number;
  height: number;
  counts: { states: number; cultures: number; burgs: number; markers: number };
  states: { id: number; name: string; form?: string; culture?: number; capital?: number; color?: string; x?: number; y?: number }[];
  cultures: { id: number; name: string; type?: string; color?: string; x?: number; y?: number }[];
  burgs: { id: number; name: string; state?: number; culture?: number; population?: number; capital?: boolean; port?: number; x: number; y: number }[];
  markers: { id: number; name: string; type?: string; icon?: string; x: number; y: number }[];
};

/** Operations our own assistant may call. Add/remove/merge/regenerate are intentionally excluded for now. */
const ALLOWED_OPERATION =
  /^(States|Burgs|Cultures|Religions|Provinces|Markers|Labels|AddedLabels)\.(rename|recolor|setFullName|setForm|setType|setCulture|setDeity|setPopulation|setTreasury|setTaxes|setLocked|setGroup|setPort|setCapital|move|setHidden|setPinned|setExpansionism|setOrigins|setCode|setEmblemsShape|setCells)$/;

const appliedProposals: import("@/services/assistant/chats").Proposal[] = [];

/** Stable proposal identity: the seed survives save/load, unlike the in-memory map-history id. */
function proposalMapId(): number {
  let hash = 2166136261;
  for (const char of options.map.seed ?? "") {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

/** Applied AI batches kept across a reload. The host passes a card+module key. */
const UNDO_LIMIT = 50;
let undoStorageKey = "";

function useUndoStorage(key: string | undefined): void {
  if (key === undefined || key === undoStorageKey) return;
  undoStorageKey = key;
  appliedProposals.length = 0;
  if (key === "") return;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (item === null || typeof item !== "object") continue;
      const proposal = item as import("@/services/assistant/chats").Proposal;
      if (proposal.state !== "applied" || typeof proposal.mapId !== "number" || !Array.isArray(proposal.change)) continue;
      appliedProposals.push(proposal);
    }
    if (appliedProposals.length > UNDO_LIMIT) appliedProposals.splice(0, appliedProposals.length - UNDO_LIMIT);
  } catch {
    // A corrupt or unavailable store only loses the undo history, never the map.
  }
}

function persistAppliedProposals(): void {
  if (undoStorageKey === "") return;
  try {
    localStorage.setItem(undoStorageKey, JSON.stringify(appliedProposals.slice(-UNDO_LIMIT)));
  } catch {
    // Undo still works for this page; only the reload history is lost.
  }
}

interface NovenMapBridge {
  readonly version: string;
  /** Replace the editor's current map with a `.map` payload. */
  load(mapData: string): Promise<void>;
  /** Serialize the current map as a `.map` payload. */
  save(): string;
  /** Generate a new map from FMG parameters. `template` includes `blank`. */
  generate(options: {
    template?: string;
    seed?: string;
    width?: number;
    height?: number;
    points?: number;
    empty?: boolean;
  }): Promise<void>;
  /** Open an empty heightmap for painting; no template or human layer is generated. */
  startBlank(options: { seed?: string; width?: number; height?: number; points?: number }): Promise<void>;
  /** Finalize the painted heightmap into a terrain-only map. */
  finalize(): Promise<void>;
  /** Add cultures, burgs and states to the finalized terrain. */
  generateHuman(options: {
    seed?: string;
    states?: number;
    cultures?: number;
    burgs?: number;
    religions?: number;
    provinces?: number;
  }): Promise<void>;
  /** Reset zoom and fit the loaded map to the visible canvas. */
  fit(): void;
  /** Show the terrain-only view for a map whose human layer has not been generated. */
  showTerrain(): void;
  /** Compose a blank sheet from a normalized terrain spec (assistant authoring). */
  composeTerrain(spec: TerrainSpec): TerrainSummary;
  /** Apply incremental terrain shape operations to the current blank draft. */
  paintTerrain(operations: TerrainOperation[]): TerrainSummary;
  /** Current terrain facts and an ASCII overview for the assistant. */
  terrainSummary(): TerrainSummary;
  /** Structured summary for our own assistant; never executes model code. */
  summary(): MapSummary;
  /** Apply a safe batch of map operations directly; returns the changed rows and keeps an undo entry. */
  applyOperations(operations: MapOperation[], undoKey?: string): { applied: number; change: { key: string; field: string; before: unknown; after: unknown }[] };
  /** Undo the last operation batch applied through this bridge. */
  undoOperations(undoKey?: string): { undone: number } | null;
  /** Number of AI batches that can still be undone for this key, including batches from the previous session. */
  undoCount(undoKey?: string): number;
  /** Drop the undo history for a key, e.g. after generating a new world. */
  clearUndoHistory(undoKey?: string): void;
}

declare global {
  interface Window {
    novenMap?: NovenMapBridge;
    novenMapReady?: boolean;
  }
}

function terrainGrid(): { points: readonly { readonly x: number; readonly y: number }[]; cells: readonly number[]; width: number; height: number } {
  if (!grid?.cells?.i?.length) throw new Error("The blank terrain is not ready");
  return {
    points: grid.points.map(([x, y]) => ({ x, y })),
    cells: Array.from(grid.cells.i),
    width: options.map.graph.width,
    height: options.map.graph.height,
  };
}

/** Publish the bridge before boot; map methods are usable after `noven:ready`. */
export function installNovenBridge(): void {
  if (window.novenMap !== undefined) return;
  window.novenMap = {
    version: VERSION,
    load: async mapData => {
      await loadMapData(mapData);
      document.getElementById("noven-blank-hint")?.remove();
      document.body.classList.remove("noven-blank", "noven-terrain");
    },
    save: () => Save.prepareMapData(),
    generate: async options => {
      await generate({
        ...(options.template === undefined ? {} : { template: options.template }),
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        ...(options.width === undefined ? {} : { width: options.width }),
        ...(options.height === undefined ? {} : { height: options.height }),
        ...(options.points === undefined ? {} : { points: options.points }),
        ...(options.empty === undefined ? {} : { empty: options.empty }),
      });
      document.dispatchEvent(new CustomEvent("noven:map-generated"));
    },
    startBlank: async options => {
      await startBlank({
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        ...(options.width === undefined ? {} : { width: options.width }),
        ...(options.height === undefined ? {} : { height: options.height }),
        ...(options.points === undefined ? {} : { points: options.points }),
      });
    },
    finalize: async () => {
      await HeightmapEditor.finalize();
      if (!window.novenBlank) restoreBlankOptions();
    },
    generateHuman: async options => {
      await generateHuman({
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        ...(options.states === undefined ? {} : { states: options.states }),
        ...(options.cultures === undefined ? {} : { cultures: options.cultures }),
        ...(options.burgs === undefined ? {} : { burgs: options.burgs }),
        ...(options.religions === undefined ? {} : { religions: options.religions }),
        ...(options.provinces === undefined ? {} : { provinces: options.provinces }),
      });
    },
    fit: () => {
      resetZoom(0);
      fitMapToScreen();
    },
    showTerrain: () => {
      Layers.set(["heightmap", "lakes", "rivers"]);
      document.body.classList.add("noven-terrain");
    },
    composeTerrain: spec => {
      if (window.novenBlank !== true) throw new Error("Terrain composition is only available on a blank sheet");
      const sheet = terrainGrid();
      const heights = renderTerrainSpec(sheet, spec);
      HeightmapEditor.applyHeights(heights);
      return summarizeTerrain(sheet, grid.cells.h);
    },
    paintTerrain: operations => {
      if (window.novenBlank !== true) throw new Error("Terrain painting is only available on a blank sheet");
      if (!Array.isArray(operations) || operations.length === 0) throw new Error("No terrain operations to apply");
      const sheet = terrainGrid();
      let heights: Uint8Array<ArrayBufferLike> = grid.cells.h.slice();
      for (const operation of operations) {
        if (operation === null || typeof operation !== "object" || typeof operation.op !== "string") throw new Error("Invalid terrain operation");
        heights = paintTerrainStep(sheet, heights, operation);
      }
      HeightmapEditor.applyHeights(heights);
      return summarizeTerrain(sheet, grid.cells.h);
    },
    terrainSummary: () => {
      const sheet = terrainGrid();
      return summarizeTerrain(sheet, grid.cells.h);
    },
    summary: () => {
      if (!pack?.cells?.i?.length) throw new Error("No map is loaded");
      const live = <T extends { i: number; removed?: boolean }>(items: readonly T[] | undefined): T[] =>
        (items ?? []).filter(item => item.i && !item.removed);
      const point = (cell: number | undefined) => {
        if (cell === undefined) return {};
        const [x, y] = pack.cells.p[cell] ?? [];
        return x === undefined || y === undefined ? {} : { x, y };
      };
      const states = live(pack.states).map(state => ({
        id: state.i,
        name: state.name,
        ...(state.form === undefined ? {} : { form: state.form }),
        ...(state.culture === undefined ? {} : { culture: state.culture }),
        ...(state.capital === undefined ? {} : { capital: state.capital }),
        ...(state.color === undefined ? {} : { color: state.color }),
        ...(state.pole === undefined ? {} : { x: state.pole[0], y: state.pole[1] }),
      }));
      const cultures = live(pack.cultures).map(culture => ({
        id: culture.i,
        name: culture.name,
        ...(culture.type === undefined ? {} : { type: culture.type }),
        ...(culture.color === undefined ? {} : { color: culture.color }),
        ...point(culture.center),
      }));
      const burgs = live(pack.burgs).map(burg => ({
        id: burg.i,
        name: burg.name ?? "",
        ...(burg.state === undefined ? {} : { state: burg.state }),
        ...(burg.culture === undefined ? {} : { culture: burg.culture }),
        ...(burg.population === undefined ? {} : { population: burg.population }),
        ...(burg.capital ? { capital: true } : {}),
        ...(burg.port === undefined ? {} : { port: burg.port }),
        x: burg.x,
        y: burg.y,
      }));
      const markers = live(pack.markers).map(marker => ({
        id: marker.i,
        name: marker.name ?? "",
        ...(marker.type === undefined ? {} : { type: marker.type }),
        ...(marker.icon === undefined ? {} : { icon: marker.icon }),
        x: marker.x,
        y: marker.y,
      }));
      return {
        seed: options.map.seed,
        width: options.map.graph.width,
        height: options.map.graph.height,
        counts: { states: states.length, cultures: cultures.length, burgs: burgs.length, markers: markers.length },
        states,
        cultures,
        burgs,
        markers,
      };
    },
    applyOperations: (operations, undoKey) => {
      useUndoStorage(undoKey);
      if (!pack?.cells?.i?.length) throw new Error("No map is loaded");
      if (!Array.isArray(operations) || operations.length === 0) throw new Error("No operations to apply");
      for (const operation of operations) {
        if (operation === null || typeof operation !== "object") throw new Error("Invalid operation");
        if (typeof operation.op !== "string" || !ALLOWED_OPERATION.test(operation.op)) {
          throw new Error(`Operation not allowed: ${String(operation.op)}`);
        }
        if (!Array.isArray(operation.args)) throw new Error(`Arguments for ${operation.op} must be a list`);
      }
      const mapId = proposalMapId();
      const proposal = Proposals.propose("AI edit", operations, appliedProposals.length + 1, mapId);
      if (typeof proposal === "string") throw new Error(proposal);
      if (!Proposals.run("apply", proposal, mapId)) throw new Error("The map changed before the edit could be applied");
      appliedProposals.push(proposal);
      persistAppliedProposals();
      return {
        applied: proposal.change.length,
        change: proposal.change.map(({ key, field, before, after }) => ({ key, field, before, after })),
      };
    },
    undoOperations: undoKey => {
      useUndoStorage(undoKey);
      const proposal = appliedProposals.pop();
      if (proposal === undefined) return null;
      if (!Proposals.run("undo", proposal, proposalMapId())) {
        appliedProposals.push(proposal);
        throw new Error("The map changed after the edit; undo is no longer safe");
      }
      persistAppliedProposals();
      return { undone: proposal.change.length };
    },
    undoCount: undoKey => {
      useUndoStorage(undoKey);
      return appliedProposals.length;
    },
    clearUndoHistory: undoKey => {
      const key = undoKey ?? undoStorageKey;
      if (key !== "") {
        try { localStorage.removeItem(key); } catch { /* history only */ }
      }
      if (key === undoStorageKey) appliedProposals.length = 0;
    },
  };
  document.addEventListener("noven:terrain-finalized", () => restoreBlankOptions());
  document.dispatchEvent(new CustomEvent("noven:bridge-ready"));
}
