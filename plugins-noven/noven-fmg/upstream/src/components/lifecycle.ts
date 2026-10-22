// The app and map lifecycle: start the app, erase what is on screen, generate a new world, put it back
import { applyGraphSize, fitMapToScreen } from "@/components/canvas";
import { closeDialogs, confirmationDialog, initDialogPositionPersistence } from "@/components/dialog/dialog-helpers";
import { Icons } from "@/components/icons";
import { Layers } from "@/components/layers";
import { applyLayersPreset } from "@/components/layers-presets";
import { hideLoading, showLoading } from "@/components/loading";
import { restoreUi, syncOptionInputs } from "@/components/options/tabs/options-tab";
import { is3dView } from "@/components/options/view-mode";
import { setSeed } from "@/components/seed";
import { initShell, warnIfServerless } from "@/components/shell";
import { clearMainTip, tip } from "@/components/tooltips";
import { undraw } from "@/components/undraw";
import { applyDefaultViewboxEvents } from "@/components/viewbox-events";
import { setViewportSize } from "@/components/viewport";
import { invokeActiveZooming, resetZoom } from "@/components/zoom";
import { Controllers } from "@/controllers";
import { getPointsNumber } from "@/data/graph-density";
import { GenerationPipeline, HumanPipeline } from "@/generators/generation-pipeline";
import { adoptLegacyIconSlots } from "@/generators/styles-legacy";
import { stashCallbackToken } from "@/services/assistant/azgaar-server/auth";
import { initiateAutosave } from "@/services/autosave";
import { logStats } from "@/services/logging";
import { registerServiceWorker } from "@/services/platform";
import { checkLoadParameters } from "@/services/url-params";
import { cleanupData } from "@/services/versioning";
import type { GridGraph } from "@/types/GridGraph";
import { debounce, ensureEl, findEl, parseError } from "@/utils";

/** Bring the app up */
export async function boot(): Promise<void> {
  stashCallbackToken(); // before anything reads the URL: the OAuth fragment is not a load parameter
  registerServiceWorker();
  initShell();
  initDialogPositionPersistence();

  Options.restore();
  await Options.restoreIcons(); // kept in IndexedDB, and needed before the first map draws
  adoptLegacyIconSlots(options.map.military.units); // the unit types a browser kept from before v1.154.0
  syncOptionInputs();
  restoreUi();
  setViewportSize(options.map.graph.width, options.map.graph.height);
  applyDefaultViewboxEvents();

  if (!warnIfServerless()) {
    hideLoading();
    await checkLoadParameters();
  }

  initiateAutosave();

  // The embedded host waits for this before calling window.novenMap.
  window.novenMapReady = true;
  document.dispatchEvent(new CustomEvent("noven:ready"));
}

export type GenerationConfig = { seed?: string; graph?: GridGraph; width?: number; height?: number; points?: number; template?: string; empty?: boolean };
export type BlankConfig = { seed?: string; width?: number; height?: number; points?: number };

/** Put the generation counts back after a blank heightmap session. */
export function restoreBlankOptions(): void {
  const previous = window.novenBlankOptions;
  if (previous) {
    options.generation.states.limit = previous.states;
    options.generation.cultures.limit = previous.cultures;
    options.generation.burgs.limit = previous.burgs;
    options.generation.religions.limit = previous.religions;
    options.generation.provinces.ratio = previous.provinces;
    window.novenBlankOptions = undefined;
  }
  if (window.novenBlank) {
    window.novenBlank = false;
    document.body.classList.remove("noven-blank");
  }
}

/**
 * Open the editor on an empty heightmap. No template is applied and no pack is
 * generated: the user paints the cells first, then finalizes the terrain.
 */
export async function startBlank(config?: BlankConfig): Promise<void> {
  try {
    const { seed, width, height, points } = config || {};
    restoreBlankOptions();
    Options.setGraphSize(width, height);
    setSeed(seed);
    Options.randomize();
    window.novenBlankOptions = {
      states: options.generation.states.limit,
      cultures: options.generation.cultures.limit,
      burgs: options.generation.burgs.limit,
      religions: options.generation.religions.limit,
      provinces: options.generation.provinces.ratio
    };
    options.generation.states.limit = 0;
    options.generation.cultures.limit = 1;
    options.generation.burgs.limit = 0;
    options.generation.religions.limit = 0;
    options.generation.provinces.ratio = 0;
    if (points !== undefined) options.map.graph.points = points;
    applyGraphSize();
    Grid.prepare();
    Pack.clear();
    options.app.heightmapEditor.renderOcean = true;
    window.novenBlank = true;
    document.body.classList.remove("noven-terrain");
    document.body.classList.add("noven-blank");
    hideLoading();
    Controllers.HeightmapEditor.open({ mode: "erase" });
    document.dispatchEvent(new CustomEvent("noven:blank-started"));
  } catch (error) {
    restoreBlankOptions();
    ERROR && console.error(error);
    throw error;
  }
}

export type HumanConfig = {
  seed?: string;
  states?: number;
  cultures?: number;
  burgs?: number;
  religions?: number;
  provinces?: number;
};

/**
 * Add the human layer (cultures, burgs, states, routes, religions and their
 * dependent data) to the terrain that was already finalized. The heightmap,
 * coastline, biomes and rivers are kept.
 */
export async function generateHuman(config?: HumanConfig): Promise<void> {
  if (!pack?.cells?.i?.length) throw new Error("Finalize the terrain before generating the human layer");
  const { seed, states, cultures, burgs, religions, provinces } = config || {};
  if (seed !== undefined) setSeed(seed);
  // A terrain-only map was generated with zero states/burgs. Use the current
  // non-zero values when present, otherwise a playable default.
  options.generation.states.limit = states ?? (options.generation.states.limit > 0 ? options.generation.states.limit : 15);
  options.generation.cultures.limit = cultures ?? (options.generation.cultures.limit > 1 ? options.generation.cultures.limit : 12);
  options.generation.burgs.limit = burgs ?? (options.generation.burgs.limit > 0 ? options.generation.burgs.limit : 400);
  options.generation.religions.limit = religions ?? (options.generation.religions.limit > 0 ? options.generation.religions.limit : 8);
  options.generation.provinces.ratio = provinces ?? (options.generation.provinces.ratio > 0 ? options.generation.provinces.ratio : 0.5);
  await HumanPipeline.run();
  document.body.classList.remove("noven-terrain");
  Options.persist();
  applyLayersPreset();
  Layers.drawAll();
  logStats();
  invokeActiveZooming();
  document.dispatchEvent(new CustomEvent("noven:human-generated"));
}

/** Generate a whole new world */
export async function generate(config?: GenerationConfig): Promise<void> {
  try {
    restoreBlankOptions();
    const { seed: precreatedSeed, graph: precreatedGraph, width, height, points, template, empty } = config || {};
    Options.setGraphSize(width, height);
    setSeed(precreatedSeed);
    Options.randomize();
    // The bridge's template must win over the random template roll.
    if (template !== undefined) options.generation.template = template;
    // A blank map is a valid single landmass with no generated polities.
    if (empty === true) {
      options.generation.states.limit = 0;
      options.generation.cultures.limit = 1;
      options.generation.burgs.limit = 0;
      options.generation.religions.limit = 0;
      options.generation.provinces.ratio = 0;
    }
    Icons.syncCustom(); // the carried-over custom icons, and the stored ones at startup
    if (precreatedGraph && points !== undefined) options.map.graph.points = points;
    applyGraphSize(); // TODO: DOM change, not part of generation

    await GenerationPipeline.run({ graph: precreatedGraph });
    Options.persist();

    syncOptionInputs();
    registerMap();
    logStats();
    invokeActiveZooming();
  } catch (error) {
    ERROR && console.error(error);
    clearMainTip();

    ensureEl("alertMessage").innerHTML = /* html */ `An error has occurred on map generation. Please retry.
      <br />If error is critical, clear the stored data and try again.
      <p id="errorBox">${parseError(error as Error)}</p>`;

    $("#alert").dialog({
      resizable: false,
      title: "Generation error",
      width: "32em",
      buttons: {
        "Cleanup data": () => cleanupData(),
        Regenerate: function (this: HTMLElement) {
          regenerateMap("generation error");
          $(this).dialog("close");
        },
        Ignore: function (this: HTMLElement) {
          $(this).dialog("close");
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });
  }
}

/** Replace the current map with a new one. Debounced: the hotkey and the button both fire it */
export const regenerateMap = debounce(async (config?: GenerationConfig | string) => {
  const reason = typeof config === "string" ? config : "user request";
  WARN && console.warn(`Generate new random map: ${reason}`);

  // a big grid takes long enough that the splash is worth showing. The size asked for, not the
  // one on screen: the map being replaced says nothing about how long the next one will take
  const shouldShowLoading = getPointsNumber(options.generation.graph.density) > 10000;
  shouldShowLoading && showLoading();

  closeDialogs("#worldConfigurator, #options3d");
  customization = 0;
  resetZoom(1000);
  undraw();
  await generate(typeof config === "string" ? undefined : config);
  Layers.drawAll();

  if (is3dView()) Controllers.View3d.redraw();
  if (findEl("worldConfigurator")?.offsetParent) Controllers.WorldConfigurator.open();

  fitMapToScreen();
  shouldShowLoading && hideLoading();
  clearMainTip();
}, 250);

/** Ask before throwing away a map the user has been working on for a while */
export function regeneratePrompt(config?: GenerationConfig): void {
  if (customization) {
    tip("New map cannot be generated when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }

  const current = mapHistory.at(-1);
  const workingMinutes = current ? (Date.now() - current.registeredAt) / 60000 : 0;
  if (workingMinutes < 1) {
    regenerateMap(config);
    return;
  }

  confirmationDialog({
    title: "Generate new map",
    message:
      "Are you sure you want to generate a new map?<br />All unsaved changes made to the current map will be lost",
    confirm: "Generate",
    onConfirm: () => {
      closeDialogs();
      regenerateMap(config);
    }
  });
}

interface MapHistoryEntry {
  seed: string;
  width: number;
  height: number;
  template: string;
  created: number;
  /** when this entry was put on screen in this session, unlike `created` never backdated to a loaded file's own timestamp */
  registeredAt: number;
}

// every map this session put on screen, oldest first; the last one is what is on screen now
globalThis.mapHistory = [];
const MAP_HISTORY_LIMIT = 100;

/** Take note of a map that is now on screen, and announce it */
export function registerMap(created: number = Date.now()): void {
  mapHistory.push({
    seed: options.map.seed,
    width: options.map.graph.width,
    height: options.map.graph.height,
    template: options.generation.template,
    created: created,
    registeredAt: Date.now()
  });
  if (mapHistory.length > MAP_HISTORY_LIMIT) mapHistory.splice(0, mapHistory.length - MAP_HISTORY_LIMIT);

  // the public seam test automation and external integrations wait on; the id is the creation date
  window.dispatchEvent(new CustomEvent("map:generated", { detail: { seed: options.map.seed, mapId: created } }));
}

declare global {
  var mapHistory: MapHistoryEntry[];
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var regeneratePrompt: (config?: GenerationConfig) => void;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var regenerateMap: (config?: GenerationConfig | string) => void;
}
window.regeneratePrompt = regeneratePrompt;
window.regenerateMap = regenerateMap;
