/**
 * Root-card payload ownership and recursive document/module lookup.
 * Internal characters own their resource tables but share the root card's files.
 * @module noven-cards/document-graph
 */
import { flattenModules, type ContentDocument, type ContentModule } from './model.ts'

/**
 * Visit the root document and every internal character in preorder.
 * @param document - Root card or character.
 * @returns Documents retaining their own appearance and resource tables.
 */
export function cardDocuments(document: ContentDocument): ContentDocument[] {
  return [document, ...document.internalCharacters.flatMap(cardDocuments)]
}

/** A module paired with the document that owns its resources. */
export interface OwnedModule {
  readonly document: ContentDocument
  readonly module: ContentModule
}

/**
 * Visit all module trees, including modules inside internal characters.
 * @param document - Root card.
 * @returns Modules and their owning documents in preorder.
 */
export function cardModules(document: ContentDocument): OwnedModule[] {
  return cardDocuments(document).flatMap(owner =>
    flattenModules(owner.modules).map(module => ({ document: owner, module })))
}

/**
 * Find a module anywhere in a root card.
 * @param document - Root card.
 * @param moduleId - Module identifier.
 * @returns Module and resource owner, or undefined when absent.
 */
export function cardModule(document: ContentDocument, moduleId: string): OwnedModule | undefined {
  return cardModules(document).find(entry => entry.module.id === moduleId)
}

/**
 * Collect all files needed to read a card and its internal characters.
 * @param document - Root card.
 * @returns Unique text, caption, resource and opaque-extension payload references.
 */
export function cardPayloadRefs(document: ContentDocument): Set<string> {
  const refs = new Set<string>()
  for (const { module } of cardModules(document)) {
    for (const block of module.blocks) {
      if (block.kind === 'text') refs.add(block.content)
      else if (block.caption !== undefined) refs.add(block.caption)
    }
  }
  for (const owner of cardDocuments(document)) {
    for (const resource of owner.resources) refs.add(resource.content)
    for (const ref of Object.values(owner.extensions)) refs.add(ref)
  }
  return refs
}

/**
 * Collect image references from a module and its decoded widget data.
 * @param module - Source module.
 * @param data - Decoded widget data, when present.
 * @returns Resource identifiers resolved against the module's owning document.
 */
export function moduleResourceIds(module: ContentModule, data: unknown): Set<string> {
  const ids = new Set<string>()
  const keys = ['resourceId', 'visualKey', 'avatar', 'imageResourceId']
  const scan = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(scan); return }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    for (const key of keys) {
      if (typeof record[key] === 'string') ids.add(record[key])
    }
    Object.values(record).forEach(scan)
  }
  scan(data)
  for (const block of module.blocks) {
    if (block.kind === 'image') ids.add(block.resourceId)
  }
  return ids
}
