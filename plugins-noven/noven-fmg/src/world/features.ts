// Feature marking: flood-fill cells into oceans, lakes and islands, and the
// coast distance field on both graphs.
// Ported from Azgaar's Fantasy-Map-Generator (MIT).
import { polygonArea } from "d3";
import type { Feature, FeatureType, GridFeature, GridGraph, PackGraph, World } from "./types.ts";
import type { Rng } from "./rng.ts";
import { clipPoly, connectVertices, distanceSquared, isLand, isWater, rn, SEA_LEVEL, TYPED_ARRAY_MAX } from "./utils.ts";
import { getLakeHeight, getLakeShoreline } from "./lakes.ts";
import { P, ra } from "./rng.ts";

const DEEPER_LAND = 3;
const LANDLOCKED = 2;
const LAND_COAST = 1;
const UNMARKED = 0;
const WATER_COAST = -1;
const DEEP_WATER = -2;

/** calculate distance to coast for every cell */
const markup = ({
  distanceField,
  neighbors,
  start,
  increment,
  limit = TYPED_ARRAY_MAX.INT8
}: {
  distanceField: Int8Array;
  neighbors: ArrayLike<readonly number[]>;
  start: number;
  increment: number;
  limit?: number;
}) => {
  for (let distance = start, marked = Infinity; marked > 0 && distance !== limit; distance += increment) {
    marked = 0;
    const prevDistance = distance - increment;
    for (let cellId = 0; cellId < neighbors.length; cellId++) {
      if (distanceField[cellId] !== prevDistance) continue;

      for (const neighborId of neighbors[cellId]) {
        if (distanceField[neighborId] !== UNMARKED) continue;
        distanceField[neighborId] = distance;
        marked++;
      }
    }
  }
};

/** mark Grid features (ocean, lakes, islands) and calculate the distance field */
export const markupGrid = (grid: GridGraph): void => {
  const { h: heights, c: neighbors, b: borderCells, i } = grid.cells;
  const cellsNumber = i.length;
  const distanceField = new Int8Array(cellsNumber); // grid.cells.t
  const featureIds = new Uint16Array(cellsNumber); // grid.cells.f
  const features: GridFeature[] = [];

  const queue = [0];
  for (let featureId = 1; queue[0] !== -1; featureId++) {
    const firstCell = queue[0];
    featureIds[firstCell] = featureId;

    const land = heights[firstCell] >= SEA_LEVEL;
    let border = false;

    while (queue.length) {
      const cellId = queue.pop() as number;
      if (!border && borderCells[cellId]) border = true;

      for (const neighborId of neighbors[cellId]) {
        const isNeibLand = heights[neighborId] >= SEA_LEVEL;

        if (land === isNeibLand && featureIds[neighborId] === UNMARKED) {
          featureIds[neighborId] = featureId;
          queue.push(neighborId);
        } else if (land && !isNeibLand) {
          distanceField[cellId] = LAND_COAST;
          distanceField[neighborId] = WATER_COAST;
        }
      }
    }

    const type = land ? "island" : border ? "ocean" : "lake";
    features.push({ i: featureId, land, border, type });

    queue[0] = featureIds.indexOf(UNMARKED); // find unmarked cell
  }

  markup({ distanceField, neighbors, start: DEEP_WATER, increment: -1, limit: -10 });
  grid.cells.t = distanceField;
  grid.cells.f = featureIds;
  grid.features = [0 as unknown as GridFeature, ...features];
};

/** mark PackGraph features and the distance field, haven/harbor, shorelines */
export const markupPack = (world: World): void => {
  const { pack } = world;
  const { cells, vertices } = pack;
  const { c: neighbors, b: borderCells, i } = cells;
  const packCellsNumber = i.length;
  if (!packCellsNumber) return;

  const distanceField = new Int8Array(packCellsNumber);
  const featureIds = new Uint16Array(packCellsNumber);
  const haven = new Uint32Array(packCellsNumber);
  const harbor = new Uint8Array(packCellsNumber);
  const features: Feature[] = [];

  const defineHaven = (cellId: number) => {
    const waterCells = neighbors[cellId].filter((index: number) => isWater(index, pack));
    const distances = waterCells.map((neibCellId: number) => distanceSquared(cells.p[cellId], cells.p[neibCellId]));
    const closest = distances.indexOf(Math.min.apply(Math, distances));

    haven[cellId] = waterCells[closest];
    harbor[cellId] = waterCells.length;
  };

  const getCellsData = (featureType: FeatureType, firstCell: number): [number, number[]] => {
    if (featureType === "ocean") return [firstCell, []];

    const getType = (cellId: number) => featureIds[cellId];
    const type = getType(firstCell);
    const ofSameType = (cellId: number) => getType(cellId) === type;
    const ofDifferentType = (cellId: number) => getType(cellId) !== type;

    const isOnBorder = (cellId: number) => Boolean(borderCells[cellId]) || neighbors[cellId].some(ofDifferentType);
    const startCell = isOnBorder(firstCell) ? firstCell : cells.i.filter(ofSameType).find(isOnBorder);
    if (startCell === undefined)
      throw new Error(`Markup: firstCell ${firstCell} is not on the feature or map border`);

    const startingVertex = cells.v[startCell].find((v: number) => vertices.c[v].some(ofDifferentType));
    if (startingVertex === undefined) throw new Error(`Markup: startingVertex for cell ${startCell} is not found`);

    const featureVertices = connectVertices({ vertices, startingVertex, ofSameType, closeRing: false });
    return [startCell, featureVertices];
  };

  const addFeature = (data: {
    firstCell: number;
    land: boolean;
    border: boolean;
    featureId: number;
    totalCells: number;
    cellsArea: number;
  }): Feature => {
    const type: FeatureType = data.land ? "island" : data.border ? "ocean" : "lake";
    const [startCell, featureVertices] = getCellsData(type, data.firstCell);
    const points = clipPoly(
      featureVertices.map((vertex: number) => vertices.p[vertex]),
      world.config.width,
      world.config.height
    );
    const area = polygonArea(points);
    const absArea = type === "ocean" ? data.cellsArea : Math.abs(rn(area)); // an ocean ring is open at the border

    const feature: Feature = {
      i: data.featureId,
      type,
      land: data.land,
      border: data.border,
      cells: data.totalCells,
      firstCell: startCell,
      vertices: featureVertices,
      area: absArea,
      shoreline: [],
      height: 0,
      subtype: "",
      group: "",
      temp: 0,
      flux: 0,
      evaporation: 0,
      name: ""
    };

    if (type === "lake") {
      if (area > 0) feature.vertices = feature.vertices.reverse();
      feature.shoreline = getLakeShoreline(feature, pack);
      feature.height = getLakeHeight(feature, pack);
    }

    return feature;
  };

  const queue = [0];
  for (let featureId = 1; queue[0] !== -1; featureId++) {
    const firstCell = queue[0];
    featureIds[firstCell] = featureId;

    const land = isLand(firstCell, pack);
    let border = Boolean(borderCells[firstCell]);
    let totalCells = 1;
    let cellsArea = cells.area[firstCell];

    while (queue.length) {
      const cellId = queue.pop() as number;
      if (borderCells[cellId]) border = true;

      for (const neighborId of neighbors[cellId]) {
        const isNeibLand = isLand(neighborId, pack);

        if (land && !isNeibLand) {
          distanceField[cellId] = LAND_COAST;
          distanceField[neighborId] = WATER_COAST;
          if (!haven[cellId]) defineHaven(cellId);
        } else if (land && isNeibLand) {
          if (distanceField[neighborId] === UNMARKED && distanceField[cellId] === LAND_COAST)
            distanceField[neighborId] = LANDLOCKED;
          else if (distanceField[cellId] === UNMARKED && distanceField[neighborId] === LAND_COAST)
            distanceField[cellId] = LANDLOCKED;
        }

        if (!featureIds[neighborId] && land === isNeibLand) {
          queue.push(neighborId);
          featureIds[neighborId] = featureId;
          totalCells++;
          cellsArea += cells.area[neighborId];
        }
      }
    }

    features.push(addFeature({ firstCell, land, border, featureId, totalCells, cellsArea }));
    queue[0] = featureIds.indexOf(UNMARKED); // find unmarked cell
  }

  markup({ distanceField, neighbors, start: DEEPER_LAND, increment: 1 }); // markup pack land
  markup({ distanceField, neighbors, start: DEEP_WATER, increment: -1, limit: -10 }); // markup pack water

  cells.t = distanceField;
  cells.f = featureIds;
  cells.haven = haven;
  cells.harbor = harbor;
  pack.features = [0 as unknown as Feature, ...features];
};

export const LAKE_SUBTYPES = ["freshwater", "salt", "dry", "sinkhole", "frozen", "lava"] as const;
export const ISLAND_SUBTYPES = ["continent", "island", "isle", "lake_island"] as const;
export const OCEAN_SUBTYPES = ["ocean", "sea", "gulf"] as const;

const getOceanSubtype = (feature: Feature, gridCellsNumber: number) => {
  if (feature.cells > gridCellsNumber / 25) return "ocean";
  if (feature.cells > gridCellsNumber / 1000) return "sea";
  return "gulf";
};

/** subtype + draw group per feature; runs after rivers, when lake inlets/outlets exist */
export const defineFeatureGroups = (world: World): void => {
  const { grid, pack } = world;
  const gridCellsNumber = grid.cells.i.length;
  const CONTINENT_MIN_SIZE = gridCellsNumber / 10;
  const ISLAND_MIN_SIZE = gridCellsNumber / 1000;

  const defineIslandSubtype = (feature: Feature) => {
    const prevFeature = pack.features[pack.cells.f[feature.firstCell - 1]];
    if (prevFeature && prevFeature.type === "lake") return "lake_island";
    if (feature.cells > CONTINENT_MIN_SIZE) return "continent";
    if (feature.cells > ISLAND_MIN_SIZE) return "island";
    return "isle";
  };

  const defineLakeSubtype = (feature: Feature) => {
    if (feature.temp < -3) return "frozen";
    if (feature.height > 60 && feature.cells < 10 && feature.firstCell % 10 === 0) return "lava";

    if (!feature.inlets && !feature.outlet) {
      if (feature.evaporation > feature.flux * 4) return "dry";
      if (feature.cells < 3 && feature.firstCell % 10 === 0) return "sinkhole";
    }

    if (!feature.outlet && feature.evaporation > feature.flux) return "salt";
    return "freshwater";
  };

  for (const feature of pack.features) {
    if (!feature) continue;

    if (feature.type === "lake") feature.height = getLakeHeight(feature, pack);
    feature.subtype =
      feature.type === "island"
        ? defineIslandSubtype(feature)
        : feature.type === "lake"
          ? defineLakeSubtype(feature)
          : getOceanSubtype(feature, gridCellsNumber);
    if (feature.type !== "ocean") {
      feature.group =
        feature.type === "lake"
          ? feature.subtype || "freshwater"
          : feature.subtype === "lake_island"
            ? "lake_island"
            : "sea_island";
    }
  }
};

/** name the features that have none; existing names are the user's and stay */
export const defineFeatureNames = (world: World, rng: Rng): void => {
  if (!world.config.names) return;
  for (const feature of world.pack.features) {
    if (!feature || feature.name) continue;

    if (feature.type === "ocean") {
      feature.name = world.namer?.feature(rng, feature) ?? (P(rng, 0.8)
        ? ra(rng, ADJECTIVES)
        : (() => {
            const [x, y] = world.pack.cells.p[feature.firstCell];
            const dx = x / world.config.width - 0.5;
            const dy = y / world.config.height - 0.5;
            return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "Western" : "Eastern") : dy < 0 ? "Northern" : "Southern";
          })());
      continue;
    }

    feature.name = world.namer?.feature(rng, feature) ?? ra(rng, ADJECTIVES);
  }
};

const ADJECTIVES = [
  "Autumn",
  "Azure",
  "Black",
  "Blue",
  "Bony",
  "Boundless",
  "Broken",
  "Calm",
  "Cold",
  "Crimson",
  "Deep",
  "Draconic",
  "Dreamy",
  "Echoing",
  "Emerald",
  "Endless",
  "Far",
  "Forbidden",
  "Forgotten",
  "Fortunate",
  "Frozen",
  "Glassy",
  "Glittering",
  "Golden",
  "Great",
  "Green",
  "Grey",
  "Icy",
  "Inner",
  "Kingly",
  "Last",
  "Light",
  "Limpid",
  "Lost",
  "Lucky",
  "Misty",
  "Mysterious",
  "Northern",
  "Old",
  "Outer",
  "Pearly",
  "Prime",
  "Purple",
  "Quiet",
  "Red",
  "Sacred",
  "Secret",
  "Silent",
  "Sleeping",
  "Southern",
  "Stormy",
  "Sunny",
  "Treasured",
  "Unknown",
  "Western",
  "White",
  "Wild",
  "Windy",
  "Yellow"
];
