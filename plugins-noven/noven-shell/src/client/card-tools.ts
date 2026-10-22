/**
 * Wire names of the Noven card tools, shared by the transcript rows and the
 * AI-editing tracker. Keep the write list to tools that mutate card content:
 * a read tool must never raise an editing shimmer.
 * @module noven-shell/client/card-tools
 */

/** Write-card tools whose saved result surfaces as a turn-tail receipt card. */
export const CARD_WRITE_TOOLS = [
  'create_card', 'create_card_bulk', 'add_module_bulk',
  'write_module_text', 'write_module_markdown', 'replace_text_range', 'write_image_caption',
  'add_module', 'add_child_module', 'rename_module', 'rename_card',
  'remove_module', 'remove_content_block', 'move_module', 'move_content_block',
  'place_module', 'set_module_layout', 'set_reading_layout', 'set_module_options',
  'set_card_image', 'clear_card_image', 'insert_owned_image', 'replace_block_image', 'remove_card_resource',
  'surface_init', 'surface_write_file', 'surface_delete_file', 'surface_rename_file', 'surface_set_manifest',
  'save_conversation_image', 'copy_internal_character', 'commit_import',
  'place_internal_character', 'create_internal_character', 'remove_internal_character',
] as const

/** Read/auxiliary card tools that keep a compact labelled row. */
export const CARD_READ_TOOLS = [
  'list_cards', 'read_card', 'read_text_block', 'read_card_image', 'export_card', 'import_card',
  'surface_read', 'surface_validate', 'surface_diagnostics',
] as const

/** All Noven card tool names, for `tool.<name>` locale key lookup. */
export type CardToolName = typeof CARD_WRITE_TOOLS[number] | typeof CARD_READ_TOOLS[number]
