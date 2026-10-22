// The layers the Layers tab lists, with their button labels and hotkeys; the style editor names elements by these
import type { LayerId } from "@/components/layers";

export interface LayerButton {
  label: string; // button text, may contain markup marking the shortcut letter
  shortcut?: string; // KeyboardEvent.code
  hint?: string; // shortcut as shown in the tip, defaults to the code without the "Key" prefix
}

// only layers listed here get a button, in registry order
export const LAYER_TOGGLES = new Map<LayerId, LayerButton>([
  ["texture", { label: "纹理", shortcut: "KeyX" }],
  ["heightmap", { label: "高度图", shortcut: "KeyH" }],
  ["lakes", { label: "湖泊", shortcut: "KeyQ" }],
  ["biomes", { label: "生物群系", shortcut: "KeyB" }],
  ["cells", { label: "网格单元", shortcut: "KeyE" }],
  ["grid", { label: "网格", shortcut: "Semicolon", hint: "; (semicolon)" }],
  ["coordinates", { label: "坐标", shortcut: "KeyO" }],
  ["compass", { label: "罗盘玫瑰", shortcut: "KeyW" }],
  ["rivers", { label: "河流", shortcut: "KeyV" }],
  ["relief", { label: "地形起伏", shortcut: "KeyF" }],
  ["religions", { label: "宗教", shortcut: "KeyR" }],
  ["cultures", { label: "文化", shortcut: "KeyC" }],
  ["states", { label: "国家", shortcut: "KeyS" }],
  ["provinces", { label: "省份", shortcut: "KeyP" }],
  ["zones", { label: "区域", shortcut: "KeyZ" }],
  ["borders", { label: "边界", shortcut: "KeyD" }],
  ["routes", { label: "道路", shortcut: "KeyU" }],
  ["temperature", { label: "温度", shortcut: "KeyT" }],
  ["ice", { label: "冰川", shortcut: "KeyJ" }],
  ["goods", { label: "商品", shortcut: "KeyG" }],
  ["markets", { label: "市场" }],
  ["trade", { label: "贸易", shortcut: "Backquote", hint: "` (backtick)" }],
  ["precipitation", { label: "降水", shortcut: "KeyA" }],
  ["population", { label: "人口", shortcut: "KeyN" }],
  ["emblems", { label: "纹章", shortcut: "KeyY" }],
  ["burgIcons", { label: "图标", shortcut: "KeyI" }],
  ["labels", { label: "标签", shortcut: "KeyL" }],
  ["military", { label: "军事", shortcut: "KeyM" }],
  ["markers", { label: "标记", shortcut: "KeyK" }],
  ["journeys", { label: "旅程" }],
  ["rulers", { label: "标尺", shortcut: "Equal", hint: "= (equal sign)" }],
  ["scaleBar", { label: "比例尺", shortcut: "Slash", hint: "/ (slash sign)" }],
  ["vignette", { label: "暗角", shortcut: "BracketLeft", hint: "[ (left square bracket)" }]
]);

/** The plain label of a layer, the hotkey markup stripped; `map` is the whole-map style element */
export function layerLabel(id: string): string {
  if (id === "map") return "地图";
  const label = LAYER_TOGGLES.get(id as LayerId)?.label.replace(/<\/?u>/g, "");
  return label ?? id.charAt(0).toUpperCase() + id.slice(1); // the permanent layers have no button
}
