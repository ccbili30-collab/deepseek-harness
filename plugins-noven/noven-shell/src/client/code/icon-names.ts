/** Icons a model may reference by name in inline code documents. */
export const CODE_ICON_NAMES = [
  'globe', 'planet', 'user', 'users', 'clock', 'layers', 'code', 'bolt', 'sparkle',
  'map', 'book', 'image', 'heart', 'bookmark', 'fork', 'file', 'grid', 'folder',
  'chat', 'search', 'plus', 'check', 'edit', 'brush', 'castle', 'route', 'flag',
  'eye', 'phone', 'wrench',
] as const

/** One allowed model-facing icon name. */
export type CodeIconName = typeof CODE_ICON_NAMES[number]
