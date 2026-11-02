/**
 * Versioned, declarative content for Noven inline `code` blocks. Model output
 * supplies only component names, content, data, and resource paths; it cannot
 * supply HTML, CSS, script, SVG source, or composer operations. Validation runs
 * before any node reaches React.
 * @module noven-shell/client/code/model
 */
import { CODE_ICON_NAMES, type CodeIconName } from './icon-names.ts'

/** JSON accepted by the inline component validator. */
export type CodeJson = null | boolean | number | string | readonly CodeJson[] | CodeJsonObject

/** A recursively JSON-safe component object. */
export interface CodeJsonObject { readonly [key: string]: CodeJson | undefined }

type Tone = 'default' | 'accent' | 'warning'
type MediaFit = 'cover' | 'contain'

interface TextNode extends CodeJsonObject { readonly component: 'text'; readonly text: string }
interface MediaNode extends CodeJsonObject { readonly component: 'media'; readonly src: string; readonly alt: string; readonly aspect?: number; readonly fit?: MediaFit }
interface IconNode extends CodeJsonObject { readonly component: 'icon'; readonly name: CodeIconName; readonly text?: string }
interface StackNode extends CodeJsonObject { readonly component: 'stack'; readonly children: readonly CodeNode[] }
interface SplitNode extends CodeJsonObject { readonly component: 'split'; readonly children: readonly [CodeNode, CodeNode] }
interface FrameNode extends CodeJsonObject { readonly component: 'frame'; readonly title?: string; readonly tone?: Tone; readonly children: readonly CodeNode[] }
interface BadgeNode extends CodeJsonObject { readonly component: 'badge'; readonly text: string; readonly tone?: Tone }

interface MediaItem extends CodeJsonObject { readonly id: string; readonly src: string; readonly alt: string; readonly label: string }
interface MediaGridNode extends CodeJsonObject { readonly component: 'media-grid'; readonly items: readonly MediaItem[]; readonly group?: string }
interface PaletteColor extends CodeJsonObject { readonly id: string; readonly name: string; readonly value: string }
interface PaletteNode extends CodeJsonObject { readonly component: 'palette'; readonly colors: readonly PaletteColor[]; readonly group?: string }

interface DialogueTurn extends CodeJsonObject {
  readonly speaker: string
  readonly text: string
  readonly portrait?: string
  readonly role?: string
  readonly expression?: string
  readonly placement?: 'left' | 'right'
}
interface DialogueNode extends CodeJsonObject { readonly component: 'dialogue'; readonly turns: readonly DialogueTurn[] }
interface NarrationNode extends CodeJsonObject { readonly component: 'narration'; readonly text: string; readonly context?: string; readonly thought?: string }
interface StoryPanelNode extends CodeJsonObject { readonly component: 'story-panel'; readonly src: string; readonly alt: string; readonly caption: string; readonly text?: string }
interface CanonDiffNode extends CodeJsonObject { readonly component: 'canon-diff'; readonly subject: string; readonly before: string; readonly after: string; readonly group: string; readonly title?: string }
interface ChoiceOption extends CodeJsonObject { readonly id: string; readonly label: string; readonly description?: string }
interface ChoicesNode extends CodeJsonObject { readonly component: 'choices'; readonly title?: string; readonly group: string; readonly options: readonly ChoiceOption[] }
interface ConflictItem extends CodeJsonObject { readonly text: string; readonly refs?: readonly string[] }
interface ConflictListNode extends CodeJsonObject { readonly component: 'conflict-list'; readonly items: readonly ConflictItem[] }

interface StatNode extends CodeJsonObject { readonly component: 'stat'; readonly label: string; readonly value: number; readonly unit?: string; readonly note?: string }
interface MeterNode extends CodeJsonObject { readonly component: 'meter'; readonly label: string; readonly value: number; readonly max?: number; readonly note?: string }
interface DataPoint extends CodeJsonObject { readonly label: string; readonly value: number }
interface BarChartNode extends CodeJsonObject { readonly component: 'bar-chart'; readonly title?: string; readonly unit?: string; readonly data: readonly DataPoint[] }
interface LineChartNode extends CodeJsonObject { readonly component: 'line-chart'; readonly title?: string; readonly unit?: string; readonly data: readonly DataPoint[]; readonly max?: number }
interface RadarChartNode extends CodeJsonObject { readonly component: 'radar-chart'; readonly title?: string; readonly data: readonly DataPoint[]; readonly max?: number }

/** Every lightweight component the inline code renderer accepts. */
export type CodeNode =
  | TextNode | MediaNode | IconNode | StackNode | SplitNode | FrameNode | BadgeNode
  | MediaGridNode | PaletteNode | DialogueNode | NarrationNode | StoryPanelNode
  | CanonDiffNode | ChoicesNode | ConflictListNode | StatNode | MeterNode
  | BarChartNode | LineChartNode | RadarChartNode

/** The versioned root stored directly in an assistant message. */
export type CodeDocument = CodeNode & { readonly version: 1 }

export { CODE_COMPONENT_IDS } from '../../code-catalog.ts'

function isJson(value: unknown): value is CodeJson {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return true
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).every(isJson)
}

function object(value: unknown): value is CodeJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && isJson(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function optionalText(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positive(value: unknown): boolean {
  return value === undefined || (finite(value) && value > 0)
}

function tone(value: unknown): boolean {
  return value === undefined || value === 'default' || value === 'accent' || value === 'warning'
}

function records(value: unknown): value is readonly CodeJsonObject[] {
  return Array.isArray(value) && value.every(object)
}

function children(value: unknown, exact?: number): boolean {
  return records(value) && (exact === undefined || value.length === exact) && value.every(child => validNode(child))
}

function exactFields(value: CodeJsonObject, fields: readonly string[], root = false): boolean {
  return Object.keys(value).every(key => fields.includes(key) || (root && key === 'version'))
}

function exactRecords(value: unknown, fields: readonly string[]): value is readonly CodeJsonObject[] {
  return records(value) && value.every(item => exactFields(item, fields))
}

function uniqueIds(items: readonly CodeJsonObject[]): boolean {
  const ids = items.map(item => item.id)
  return ids.every(text) && new Set(ids).size === ids.length
}

function dataPoints(value: unknown, minimum = 1): boolean {
  return exactRecords(value, ['label', 'value']) && value.length >= minimum
    && value.every(item => text(item.label) && finite(item.value) && item.value >= 0)
}

function validNode(node: CodeJsonObject, root = false): node is CodeNode {
  switch (node.component) {
    case 'text': return exactFields(node, ['component', 'text'], root) && text(node.text)
    case 'media':
      return exactFields(node, ['component', 'src', 'alt', 'aspect', 'fit'], root)
        && text(node.src) && text(node.alt) && positive(node.aspect)
        && (node.fit === undefined || node.fit === 'cover' || node.fit === 'contain')
    case 'icon':
      return exactFields(node, ['component', 'name', 'text'], root)
        && typeof node.name === 'string' && (CODE_ICON_NAMES as readonly string[]).includes(node.name) && optionalText(node.text)
    case 'stack': return exactFields(node, ['component', 'children'], root) && children(node.children)
    case 'split': return exactFields(node, ['component', 'children'], root) && children(node.children, 2)
    case 'frame':
      return exactFields(node, ['component', 'title', 'tone', 'children'], root)
        && optionalText(node.title) && tone(node.tone) && children(node.children)
    case 'badge': return exactFields(node, ['component', 'text', 'tone'], root) && text(node.text) && tone(node.tone)
    case 'media-grid':
      return exactFields(node, ['component', 'items', 'group'], root)
        && exactRecords(node.items, ['id', 'src', 'alt', 'label']) && node.items.length > 0 && uniqueIds(node.items)
        && (node.group === undefined || text(node.group))
        && node.items.every(item => text(item.src) && text(item.alt) && text(item.label))
    case 'palette':
      return exactFields(node, ['component', 'colors', 'group'], root)
        && exactRecords(node.colors, ['id', 'name', 'value']) && node.colors.length > 0 && uniqueIds(node.colors)
        && (node.group === undefined || text(node.group))
        && node.colors.every(item => text(item.name) && /^#[0-9a-fA-F]{6}$/u.test(String(item.value)))
    case 'dialogue':
      return exactFields(node, ['component', 'turns'], root)
        && exactRecords(node.turns, ['speaker', 'text', 'portrait', 'role', 'expression', 'placement'])
        && node.turns.length > 0 && node.turns.every(turn => text(turn.speaker) && text(turn.text)
          && optionalText(turn.portrait) && optionalText(turn.role) && optionalText(turn.expression)
          && (turn.placement === undefined || turn.placement === 'left' || turn.placement === 'right'))
    case 'narration':
      return exactFields(node, ['component', 'text', 'context', 'thought'], root)
        && text(node.text) && optionalText(node.context) && optionalText(node.thought)
    case 'story-panel':
      return exactFields(node, ['component', 'src', 'alt', 'caption', 'text'], root)
        && text(node.src) && text(node.alt) && text(node.caption) && optionalText(node.text)
    case 'canon-diff':
      return exactFields(node, ['component', 'subject', 'before', 'after', 'group', 'title'], root)
        && text(node.subject) && text(node.before) && text(node.after) && text(node.group) && optionalText(node.title)
    case 'choices':
      return exactFields(node, ['component', 'title', 'group', 'options'], root)
        && text(node.group) && optionalText(node.title)
        && exactRecords(node.options, ['id', 'label', 'description']) && node.options.length > 0 && uniqueIds(node.options)
        && node.options.every(option => text(option.label) && optionalText(option.description))
    case 'conflict-list':
      return exactFields(node, ['component', 'items'], root)
        && exactRecords(node.items, ['text', 'refs']) && node.items.length > 0 && node.items.every(item => text(item.text)
          && (item.refs === undefined || (Array.isArray(item.refs) && item.refs.every(ref => typeof ref === 'string'))))
    case 'stat':
      return exactFields(node, ['component', 'label', 'value', 'unit', 'note'], root)
        && text(node.label) && finite(node.value) && optionalText(node.unit) && optionalText(node.note)
    case 'meter':
      return exactFields(node, ['component', 'label', 'value', 'max', 'note'], root)
        && text(node.label) && finite(node.value) && node.value >= 0 && positive(node.max) && optionalText(node.note)
    case 'bar-chart':
      return exactFields(node, ['component', 'title', 'unit', 'data'], root)
        && optionalText(node.title) && optionalText(node.unit) && dataPoints(node.data)
    case 'line-chart':
      return exactFields(node, ['component', 'title', 'unit', 'data', 'max'], root)
        && optionalText(node.title) && optionalText(node.unit) && dataPoints(node.data, 2) && positive(node.max)
    case 'radar-chart':
      return exactFields(node, ['component', 'title', 'data', 'max'], root)
        && optionalText(node.title) && dataPoints(node.data, 3) && positive(node.max)
    default: return false
  }
}

/**
 * Validate one complete model-authored code document.
 * @param data - Parsed JSON from a sealed inline block directive.
 * @returns The typed document, or undefined when any node or field is unsupported.
 */
export function validateCodeDocument(data: CodeJsonObject): CodeDocument | undefined {
  if (data.version !== 1 || !validNode(data, true)) return undefined
  return { ...data, version: 1 }
}
