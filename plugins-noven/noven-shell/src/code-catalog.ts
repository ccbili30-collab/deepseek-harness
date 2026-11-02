/**
 * Shared model-facing catalog for inline code components. Client validation and
 * rendering tests consume the same ids, so prompt coverage cannot drift quietly.
 * @module noven-shell/code-catalog
 */

/** One component and its accepted fields in model-facing shorthand. */
export interface CodeComponentCatalogEntry {
  readonly id: string
  readonly fields: string
}

/** All lightweight components available to assistant replies. */
export const CODE_COMPONENT_CATALOG: readonly CodeComponentCatalogEntry[] = [
  { id: 'text', fields: 'text' },
  { id: 'media', fields: 'src, alt; optional aspect, fit=cover|contain' },
  { id: 'icon', fields: 'name; optional text' },
  { id: 'stack', fields: 'children[]' },
  { id: 'split', fields: 'exactly two children[]' },
  { id: 'frame', fields: 'children[]; optional title, tone=default|accent|warning' },
  { id: 'badge', fields: 'text; optional tone' },
  { id: 'media-grid', fields: 'items[{id,src,alt,label}]; optional group for selectable tiles' },
  { id: 'palette', fields: 'colors[{id,name,value:#RRGGBB}]; optional group for selectable colors' },
  { id: 'dialogue', fields: 'turns[{speaker,text,portrait?,role?,expression?,placement?:left|right}]' },
  { id: 'narration', fields: 'text; optional context, thought' },
  { id: 'story-panel', fields: 'src, alt, caption; optional text' },
  { id: 'canon-diff', fields: 'subject, before, after, group; optional title' },
  { id: 'choices', fields: 'group, options[{id,label,description?}]; optional title' },
  { id: 'conflict-list', fields: 'items[{text,refs?:string[]}]' },
  { id: 'stat', fields: 'label, value:number; optional unit, note' },
  { id: 'meter', fields: 'label, value:number>=0; optional max>0 (default 100), note' },
  { id: 'bar-chart', fields: 'data[{label,value:number>=0}]; optional title, unit' },
  { id: 'line-chart', fields: 'at least two data points; optional title, unit, max>0' },
  { id: 'radar-chart', fields: 'at least three data points; optional title, max>0' },
]

/** Component ids used by client contract tests. */
export const CODE_COMPONENT_IDS: readonly string[] = CODE_COMPONENT_CATALOG.map(entry => entry.id)

/** Compact parameter catalog included in the system prompt. */
export const CODE_COMPONENT_CATALOG_TEXT = CODE_COMPONENT_CATALOG.map(entry => `- \`${entry.id}\`: ${entry.fields}`).join('\n')
