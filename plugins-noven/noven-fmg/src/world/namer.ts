// 命名参考层：config.namebase 给定语料（预设/序号/内联）时构建世界级命名器。
// 风格由语料决定——预设只是示范，AI 可自建任意风格语料（local/namebases/*.json 或内联）。
import { ra, type Rng } from "./rng.ts";
import { last } from "./utils.ts";
import { calculateChain, getBase, getBaseShort, getState } from "./names.ts";
import { BUILTIN_NAMEBASES } from "./namebase-presets.ts";
import type { NamebaseDef, World, WorldConfig, WorldNamer } from "./types.ts";

/** namebase 配置 → 语料定义；未配置返回 null（走逐文化默认命名） */
const resolveNamebase = (config: WorldConfig): NamebaseDef | number | null => {
  const nb = config.namebase;
  if (nb === undefined || nb === null || nb === "") return null;
  if (typeof nb === "number") return nb;
  if (typeof nb === "string") {
    const def = BUILTIN_NAMEBASES[nb];
    if (!def) throw new Error(`未知 namebase 预设 '${nb}'（可用：${Object.keys(BUILTIN_NAMEBASES).join("/")}、Markov 库序号、或内联语料）`);
    return def;
  }
  return nb;
};

const FALLBACK_SUFFIX: Record<string, readonly string[]> = {
  burg: ["城"],
  river: ["河"],
  state: ["国"],
  culture: [],
  "feature:ocean": ["海"],
  "feature:lake": ["湖"],
  "feature:island": ["岛"],
  "feature:default": ["原"]
};

const pickSuffix = (rng: Rng, def: NamebaseDef, kind: string): string => {
  const list = def.suffix?.[kind] ?? FALLBACK_SUFFIX[kind] ?? [];
  return list.length ? ra(rng, list as string[]) : "";
};

/** 字级马尔可夫：语料的相邻字转移 + 首字分布，产出 1–3 字专名 */
const makeStemGen = (names: readonly string[]): ((rng: Rng) => string) => {
  const starts = names.map(n => [...n][0]!).filter(Boolean);
  const nexts = new Map<string, string[]>();
  const pool: string[] = [];
  for (const n of names) {
    const chars = [...n];
    for (let i = 0; i < chars.length; i++) {
      pool.push(chars[i]);
      if (i + 1 < chars.length) {
        const k = chars[i];
        if (!nexts.has(k)) nexts.set(k, []);
        nexts.get(k)!.push(chars[i + 1]);
      }
    }
  }
  return (rng: Rng): string => {
    const len = rng() < 0.7 ? 2 : rng() < 0.75 ? 1 : 3;
    let w = ra(rng, starts);
    for (let i = 1; i < len; i++) {
      const opts = nexts.get(last([...w])!) ?? pool;
      w += ra(rng, opts);
    }
    return w;
  };
};

/** 从 basename 剥掉已知通名得到专名（先配表整体匹配，再按通名用字兜底） */
const makeStemStrip = (def: NamebaseDef): ((name: string) => string) => {
  const suffixes = Object.values(def.suffix ?? {}).flat() as string[];
  const suffixChars = new Set(suffixes.flatMap(s => [...s]));
  const sorted = [...suffixes].sort((a, b) => b.length - a.length);
  return (name: string): string => {
    for (const s of sorted) if (s && name.length > s.length && name.endsWith(s)) return name.slice(0, -s.length);
    const tail = last([...name]);
    return tail !== undefined && suffixChars.has(tail) && name.length > 1 ? [...name].slice(0, -1).join("") : name;
  };
};

/** 语料马尔可夫（西文音节链）：供 mode:'markov' 的自建语料 */
const makeMarkovGen = (def: NamebaseDef) => {
  const chain = calculateChain(def.names.join(","));
  const min = def.min ?? 5;
  const max = def.max ?? 10;
  return (rng: Rng): string => {
    let v = chain[""];
    let cur = ra(rng, v);
    let w = "";
    for (let i = 0; i < 20; i++) {
      if (cur === "") {
        if (w.length >= min) break;
        w = "";
        v = chain[""];
      } else {
        if (w.length + cur.length > max) {
          if (w.length < min) w += cur;
          break;
        }
        v = chain[last(cur.split(""))] || chain[""];
      }
      w += cur;
      cur = ra(rng, v);
    }
    if (!w) return ra(rng, def.names as string[]);
    const tail = last(w.split(""));
    if (tail === "'" || tail === " " || tail === "-") w = w.slice(0, -1);
    return /^[a-z]/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w;
  };
};

/** config.namebase → WorldNamer；无效/未配置返回 null，调用方回落默认命名 */
export const buildWorldNamer = (world: World): WorldNamer | null => {
  const nb = resolveNamebase(world.config);
  if (nb === null) return null;
  const used = new Set<string>();
  const uniq = (rng: Rng, gen: () => string): string => {
    for (let i = 0; i < 100; i++) {
      const n = gen();
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return gen();
  };

  // Markov 库序号：全文化统一用指定语种库
  if (typeof nb === "number") {
    const base = nb;
    return {
      culture: rng => uniq(rng, () => getBaseShort(rng, base)),
      burg: (rng, _c, short) => uniq(rng, () => (short ? getBaseShort(rng, base) : getBase(rng, base))),
      state: (rng, basename, culture) => getState(rng, world.pack.cultures, basename, culture, base),
      river: () => undefined,
      feature: () => undefined
    };
  }

  if (!nb.names?.length) return null;
  const def: NamebaseDef = { mode: "compose", ...nb };

  if (def.mode === "markov") {
    const gen = makeMarkovGen(def);
    return {
      culture: rng => uniq(rng, () => gen(rng)),
      burg: rng => uniq(rng, () => gen(rng)),
      state: (rng, basename) => uniq(rng, () => basename || gen(rng)),
      river: () => undefined,
      feature: () => undefined
    };
  }

  const stem = makeStemGen(def.names);
  const strip = makeStemStrip(def);
  return {
    culture: rng => uniq(rng, () => stem(rng) + pickSuffix(rng, def, "culture")),
    burg: (rng, _c, short) => uniq(rng, () => (short ? stem(rng) : stem(rng) + pickSuffix(rng, def, "burg"))),
    state: (rng, basename) => uniq(rng, () => (basename ? strip(basename) : stem(rng)) + pickSuffix(rng, def, "state")),
    river: rng => uniq(rng, () => stem(rng) + pickSuffix(rng, def, "river")),
    feature: (rng, feature) => {
      const kind = `feature:${feature.type}` in (def.suffix ?? {}) || `feature:${feature.type}` in FALLBACK_SUFFIX
        ? `feature:${feature.type}`
        : "feature:default";
      return uniq(rng, () => stem(rng) + pickSuffix(rng, def, kind));
    }
  };
};
