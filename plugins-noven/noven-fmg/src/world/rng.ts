// Seeded randomness, passed explicitly instead of FMG's `Math.random = Alea(seed)` patch.
import Alea from "alea";
import { randomNormal } from "d3";

export type Rng = () => number;

export const createRng = (seed: string): Rng => Alea(seed);

/** random integer in [min, max]; `rand(rng, 5)` is `rand(rng, 0, 5)` */
export const rand = (rng: Rng, min?: number, max?: number): number => {
  if (min === undefined && max === undefined) return rng();
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.floor(rng() * (max! - min! + 1)) + min!;
};

/** true with the given probability */
export const P = (rng: Rng, probability: number): boolean => {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  return rng() < probability;
};

/** predicate that is true every n-th index */
export const each = (n: number) => (i: number) => i % n === 0;

/** random element of an indexed collection */
export const ra = <T>(rng: Rng, array: ArrayLike<T>): T => array[Math.floor(rng() * array.length)];

/** random key weighted by the values */
export const rw = (rng: Rng, object: { [key: string]: number }): string => {
  const array = [];
  for (const key in object) {
    for (let i = 0; i < object[key]; i++) {
      array.push(key);
    }
  }
  return array[Math.floor(rng() * array.length)];
};

/** number from a range string like "1-3", "2" or "0.5" (fractional part is a chance) */
export const getNumberInRange = (rng: Rng, r: string): number => {
  if (!Number.isNaN(+r)) return ~~r + +P(rng, +r - ~~r);
  const sign = r[0] === "-" ? -1 : 1;
  if (Number.isNaN(+r[0])) r = r.slice(1);
  if (!r.includes("-")) return 0;
  const range = r.split("-");
  const count = rand(rng, parseFloat(range[0]) * sign, +parseFloat(range[1]));
  if (Number.isNaN(count) || count < 0) return 0;
  return count;
};

/** gaussian value in [min, max], rounded to `round` decimals — seeded via `rng` */
export const gauss = (rng: Rng, expected = 100, deviation = 30, min = 0, max = 300, round = 0): number => {
  const m = 10 ** round;
  const v = randomNormal.source(rng)(expected, deviation)();
  return Math.round(Math.min(Math.max(v, min), max) * m) / m;
};

export const generateSeed = (): string => String(Math.floor(Math.random() * 1e9));
