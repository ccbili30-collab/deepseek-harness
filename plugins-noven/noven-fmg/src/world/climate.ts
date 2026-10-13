// Climate: the lat/lon box the map sits in, per-cell temperature, and a
// wind-pass precipitation model.
// Ported from Azgaar's Fantasy-Map-Generator (MIT).
import { mean, range } from "d3";
import type { LatLonBox, World, WorldConfig } from "./types.ts";
import type { Rng } from "./rng.ts";
import { rand } from "./rng.ts";
import { minmax, rn, SEA_LEVEL } from "./utils.ts";

/** calculate the map lat/lon box from its size and position */
export const deriveCoordinates = (config: WorldConfig): LatLonBox => {
  const sizeFraction = config.mapSize / 100;
  const latShift = config.latitude / 100;
  const lonShift = config.longitude / 100;

  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);

  const lonT = rn(Math.min((config.width / config.height) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);

  return { latT, latN, latS, lonT, lonW, lonE };
};

/** temperature of every grid cell for the given heights; the grid itself stays untouched */
export const computeTemperature = (world: World, h: ArrayLike<number>): Int8Array => {
  const { grid, config, coordinates } = world;
  const { cells, cellsX, points } = grid;
  const temp = new Int8Array(cells.i.length);

  const { equator: temperatureEquator, northPole: temperatureNorthPole, southPole: temperatureSouthPole } =
    config.temperature;
  const tropics = [16, -20]; // tropics zone
  const tropicalGradient = 0.15;

  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);

  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);

  const exponent = config.heightExponent;

  const getSeaLevelTemperature = (latitude: number) => {
    const isTropical = latitude <= 16 && latitude >= -20;
    if (isTropical) return temperatureEquator - Math.abs(latitude) * tropicalGradient;

    return latitude > 0
      ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
      : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
  };

  // temperature drops by 6.5°C per 1km of altitude
  const getAltitudeDrop = (height: number) => {
    if (height < SEA_LEVEL) return 0;
    return rn(((height - 18) ** exponent / 1000) * 6.5);
  };

  for (let rowCellId = 0; rowCellId < cells.i.length; rowCellId += cellsX) {
    const [, y] = points[rowCellId];
    const rowLatitude = coordinates.latN - (y / config.height) * coordinates.latT; // [90; -90]
    const seaLevelTemp = getSeaLevelTemperature(rowLatitude);

    for (let cellId = rowCellId; cellId < rowCellId + cellsX; cellId++) {
      temp[cellId] = minmax(seaLevelTemp - getAltitudeDrop(h[cellId]), -128, 127);
    }
  }

  return temp;
};

// precipitation modifier per 5° latitude band
const LATITUDE_MODIFIER = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];

const MAX_PASSABLE_ELEVATION = 85;

type WindBand = [number, number, number]; // [firstCellId, latitudeModifier, windTier]
export interface Winds {
  westerly: WindBand[];
  easterly: WindBand[];
  northerly: number;
  southerly: number;
}

/** rows and columns the prevailing winds enter through, derived from the map position */
export const getWinds = (world: World): Winds => {
  const { grid, config, coordinates } = world;
  const { cells, cellsX, cellsY } = grid;
  const westerly: WindBand[] = [];
  const easterly: WindBand[] = [];
  let northerly = 0;
  let southerly = 0;

  range(0, cells.i.length, cellsX).forEach((cellId, rowId) => {
    const lat = coordinates.latN - (rowId / cellsY) * coordinates.latT;
    const latMod = LATITUDE_MODIFIER[((Math.abs(lat) - 1) / 5) | 0];
    const tier = (Math.abs(lat - 89) / 30) | 0; // 30° tiers from 0 to 5, north to south
    const angle = config.winds[tier];

    if (angle > 40 && angle < 140) westerly.push([cellId, latMod, tier]);
    if (angle > 220 && angle < 320) easterly.push([cellId + cellsX - 1, latMod, tier]);
    if (angle > 100 && angle < 260) northerly++;
    if (angle > 280 || angle < 80) southerly++;
  });

  return { westerly, easterly, northerly, southerly };
};

/** precipitation of every grid cell for the given heights and temperatures */
export const computePrecipitation = (world: World, rng: Rng, h: ArrayLike<number>, temp: ArrayLike<number>): Uint8Array => {
  const { grid, config, coordinates } = world;
  const { cells, cellsX, cellsY } = grid;
  const prec = new Uint8Array(cells.i.length);

  const cellsNumberModifier = (config.points / 10000) ** 0.25;
  const modifier = cellsNumberModifier * (config.precipitation / 100);

  const getPrecipitation = (humidity: number, i: number, n: number) => {
    const normalLoss = Math.max(humidity / (10 * modifier), 1);
    const diff = Math.max(h[i + n] - h[i], 0); // difference in height
    const mod = (h[i + n] / 70) ** 2; // 50 stands for hills, 70 for mountains
    return minmax(normalLoss + diff * mod, 1, humidity);
  };

  const passWind = (sources: (number | WindBand)[], initialMaxPrec: number, next: number, steps: number) => {
    let maxPrec = initialMaxPrec;

    for (const source of sources) {
      let first: number;
      if (Array.isArray(source)) {
        if (!source[0]) continue; // legacy quirk: a band starting at cell 0 is skipped, fixing it changes every map
        maxPrec = Math.min(initialMaxPrec * source[1], 255);
        first = source[0];
      } else first = source;

      let humidity = maxPrec - h[first]; // initial water amount
      if (humidity <= 0) continue;

      for (let s = 0, current = first; s < steps; s++, current += next) {
        if (temp[current] < -5) continue; // no flux in permafrost

        if (h[current] < SEA_LEVEL) {
          if (h[current + next] >= SEA_LEVEL) {
            prec[current + next] += Math.max(humidity / rand(rng, 10, 20), 1); // coastal precipitation
          } else {
            humidity = Math.min(humidity + 5 * modifier, maxPrec); // wind gets humidity over water
            prec[current] += 5 * modifier; // water cells precipitation
          }
          continue;
        }

        // land cell
        const isPassable = h[current + next] <= MAX_PASSABLE_ELEVATION;
        const precipitation = isPassable ? getPrecipitation(humidity, current, next) : humidity;
        prec[current] += precipitation;
        const evaporation = precipitation > 1.5 ? 1 : 0; // some humidity evaporates back
        humidity = isPassable ? minmax(humidity - precipitation + evaporation, 0, maxPrec) : 0;
      }
    }
  };

  const { westerly, easterly, northerly, southerly } = getWinds(world);

  if (westerly.length) passWind(westerly, 120 * modifier, 1, cellsX);
  if (easterly.length) passWind(easterly, 120 * modifier, -1, cellsX);

  const vertT = southerly + northerly;
  if (northerly) {
    const bandN = ((Math.abs(coordinates.latN) - 1) / 5) | 0;
    const latModN = coordinates.latT > 60 ? (mean(LATITUDE_MODIFIER) as number) : LATITUDE_MODIFIER[bandN];
    const maxPrecN = (northerly / vertT) * 60 * modifier * latModN;
    passWind(range(0, cellsX, 1), maxPrecN, cellsX, cellsY);
  }

  if (southerly) {
    const bandS = ((Math.abs(coordinates.latS) - 1) / 5) | 0;
    const latModS = coordinates.latT > 60 ? (mean(LATITUDE_MODIFIER) as number) : LATITUDE_MODIFIER[bandS];
    const maxPrecS = (southerly / vertT) * 60 * modifier * latModS;
    passWind(range(cells.i.length - cellsX, cells.i.length, 1), maxPrecS, -cellsX, cellsY);
  }

  return prec;
};
