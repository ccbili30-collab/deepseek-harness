// Markov name generator: per-culture syllable chains over vendored name bases.
// Adapted from Azgaar's Fantasy-Map-Generator (MIT); Math.random replaced by the
// pipeline Rng and the global `pack.cultures` by an explicit lookup.
import { P, ra, rand, type Rng } from "./rng.ts";
import { capitalize, isVowel, last } from "./utils.ts";
import { getDefaultNameBases, type NameBase } from "./namebases.ts";

type MarkovChain = string[][] & Record<string, string[]>;

export interface CultureNamer {
  base: number;
}

const nameBases: NameBase[] = getDefaultNameBases();
const chains: (MarkovChain | null)[] = [];

const calculateChain = (namesList: string): MarkovChain => {
  const chain: MarkovChain = [] as unknown as MarkovChain;
  const availableNames = namesList.split(",");

  for (const n of availableNames) {
    const name = n.trim().toLowerCase();
    const basic = !/[^\x20-\x7e]/.test(name); // printable ASCII gets English splitting rules

    // split word into pseudo-syllables
    for (let i = -1, syllable = ""; i < name.length; i += syllable.length || 1, syllable = "") {
      const prev = name[i] || ""; // pre-onset letter
      let v = 0; // 0 if no vowels in syllable

      for (let c = i + 1; name[c] && syllable.length < 5; c++) {
        const that = name[c];
        const next = name[c + 1];
        syllable += that;
        if (syllable === " " || syllable === "-") break;
        if (!next || next === " " || next === "-") break;

        if (isVowel(that)) v = 1;

        if (that === "y" && next === "e") continue; // 'ye'
        if (basic) {
          if (that === "o" && next === "o") continue; // 'oo'
          if (that === "e" && next === "e") continue; // 'ee'
          if (that === "a" && next === "e") continue; // 'ae'
          if (that === "c" && next === "h") continue; // 'ch'
        }

        if (isVowel(that) === (next as unknown as boolean)) break;
        if (v && isVowel(name[c + 2])) break;
      }

      if (!chain[prev]) chain[prev] = [];
      chain[prev].push(syllable);
    }
  }

  return chain;
};

const updateChain = (index: number): void => {
  chains[index] = nameBases[index]?.b ? calculateChain(nameBases[index].b) : null;
};

/** generate a name from a name base */
export const getBase = (rng: Rng, base: number, min?: number, max?: number, dupl?: string): string => {
  if (nameBases[base] === undefined) {
    if (nameBases[0]) base = 0;
    else throw new Error("No namebases defined");
  }

  if (!chains[base]) updateChain(base);
  const data = chains[base];
  if (!data || data[""] === undefined) throw new Error(`Namebase ${base} is incorrect`);

  if (!min) min = nameBases[base].min;
  if (!max) max = nameBases[base].max;
  if (dupl !== "") dupl = nameBases[base].d;

  let v = data[""];
  let cur = ra(rng, v);
  let w = "";
  for (let i = 0; i < 20; i++) {
    if (cur === "") {
      if (w.length < min) {
        cur = "";
        w = "";
        v = data[""];
      } else break;
    } else {
      if (w.length + cur.length > max) {
        if (w.length < min) w += cur;
        break;
      } else v = data[last(cur.split(""))] || data[""];
    }

    w += cur;
    cur = ra(rng, v);
  }

  const l = last(w.split(""));
  if (l === "'" || l === " " || l === "-") w = w.slice(0, -1);

  let name = [...w].reduce((r, c, i, d) => {
    if (c === d[i + 1] && !dupl!.includes(c)) return r;
    if (!r.length) return c.toUpperCase();
    if (r.slice(-1) === "-" && c === " ") return r;
    if (r.slice(-1) === " ") return r + c.toUpperCase();
    if (r.slice(-1) === "-") return r + c.toUpperCase();
    if (c === "a" && d[i + 1] === "e") return r;
    if (i + 2 < d.length && c === d[i + 1] && c === d[i + 2]) return r;
    return r + c;
  }, "");

  if (name.split(" ").some(part => part.length < 2))
    name = name
      .split(" ")
      .map((p, i) => (i ? p.toLowerCase() : p))
      .join("");

  if (name.length < 2) name = ra(rng, nameBases[base].b.split(",")).trim();

  return name;
};

export const getCulture = (rng: Rng, cultures: CultureNamer[], culture: number, min?: number, max?: number, dupl?: string): string =>
  getBase(rng, cultures[culture].base, min, max, dupl);

export const getBaseShort = (rng: Rng, base: number): string => {
  const min = nameBases[base] ? nameBases[base].min - 1 : undefined;
  const max = min ? Math.max(nameBases[base].max - 2, min) : undefined;
  return getBase(rng, base, min, max, "");
};

export const getCultureShort = (rng: Rng, cultures: CultureNamer[], culture: number): string =>
  getBaseShort(rng, cultures[culture].base);

const validateSuffix = (name: string, suffix: string): string => {
  if (name.slice(-1 * suffix.length) === suffix) return name;
  const s1 = suffix.charAt(0);
  if (name.slice(-1) === s1) name = name.slice(0, -1);
  if (isVowel(s1) === isVowel(name.slice(-1)) && isVowel(s1) === isVowel(name.slice(-2, -1)))
    name = name.slice(0, -1);
  if (name.slice(-1) === s1) name = name.slice(0, -1);
  return name + suffix;
};

const addSuffix = (rng: Rng, name: string): string => {
  const suffix = P(rng, 0.8) ? "ia" : "land";
  if (suffix === "ia" && name.length > 6) name = name.slice(0, -(name.length - 3));
  else if (suffix === "land" && name.length > 6) name = name.slice(0, -(name.length - 5));
  return validateSuffix(name, suffix);
};

/** state name from a capital name (or a fresh culture name) with a culture-specific suffix */
export const getState = (rng: Rng, cultures: CultureNamer[], name: string, culture: number, base?: number): string => {
  if (base === undefined) base = cultures[culture].base;

  if (name.includes(" ")) name = capitalize(name.replace(/ /g, "").toLowerCase());
  if (name.length > 6 && name.slice(-4) === "berg") name = name.slice(0, -4);
  if (name.length > 5 && name.slice(-3) === "ton") name = name.slice(0, -3);

  if (base === 5 && ["sk", "ev", "ov"].includes(name.slice(-2))) name = name.slice(0, -2);
  else if (base === 12) return isVowel(name.slice(-1)) ? name : `${name}u`;
  else if (base === 18 && P(rng, 0.4))
    name = isVowel(name.slice(0, 1).toLowerCase()) ? `Al${name.toLowerCase()}` : `Al ${name}`;

  if (base > 32 && base < 42) return name; // no suffix for fantasy bases

  if (name.length > 3 && isVowel(name.slice(-1))) {
    if (isVowel(name.slice(-2, -1)) && P(rng, 0.85)) name = name.slice(0, -2);
    else if (P(rng, 0.7)) name = name.slice(0, -1);
    else return name;
  } else if (P(rng, 0.4)) return name;

  let suffix = "ia";
  const rnd = rng();
  const l = name.length;
  if (base === 3 && rnd < 0.03 && l < 7) suffix = "terra";
  else if (base === 4 && rnd < 0.03 && l < 7) suffix = "terra";
  else if (base === 13 && rnd < 0.03 && l < 7) suffix = "terra";
  else if (base === 2 && rnd < 0.03 && l < 7) suffix = "terre";
  else if (base === 0 && rnd < 0.5 && l < 7) suffix = "land";
  else if (base === 1 && rnd < 0.4 && l < 7) suffix = "land";
  else if (base === 6 && rnd < 0.3 && l < 7) suffix = "land";
  else if (base === 32 && rnd < 0.1 && l < 7) suffix = "land";
  else if (base === 7 && rnd < 0.1) suffix = "eia";
  else if (base === 9 && rnd < 0.35) suffix = "maa";
  else if (base === 15 && rnd < 0.4 && l < 6) suffix = "orszag";
  else if (base === 16) suffix = rnd < 0.6 ? "yurt" : "eli";
  else if (base === 10) suffix = "guk";
  else if (base === 11) suffix = " Guo";
  else if (base === 14) suffix = rnd < 0.5 && l < 6 ? "tlan" : "co";
  else if (base === 17 && rnd < 0.8) suffix = "a";
  else if (base === 18 && rnd < 0.8) suffix = "a";

  return validateSuffix(name, suffix);
};

/** map name drawn mostly from English/French bases */
export const getMapName = (rng: Rng): string => {
  const base = P(rng, 0.7) ? 2 : P(rng, 0.5) ? rand(rng, 0, 6) : rand(rng, 0, 31);
  if (!nameBases[base]) return "";
  const min = nameBases[base].min - 1;
  const max = Math.max(nameBases[base].max - 3, min);
  const baseName = getBase(rng, base, min, max, "");
  return P(rng, 0.7) ? addSuffix(rng, baseName) : baseName;
};
