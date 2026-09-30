/**
 * Noven tool-call presentations seated in `tool.call.toolview` (keyed by wire
 * tool name): every card tool renders one compact labelled row inside the
 * collapsed process group. The saved-card receipt itself is a Turn-level
 * element registered on `conversation.chat.turnTail` (see card-receipt.ts).
 * @module noven-shell/client/toolviews
 */
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovenShellLocaleKey } from './locales.ts'
import { selectSavedCards, type SavedCardResult } from './card-receipt.ts'
import { glyph } from './icons.tsx'

/** Write-card tools whose saved result surfaces as a turn-tail receipt card. */
export const CARD_WRITE_TOOLS = [
  'create_card', 'create_card_bulk', 'add_module_bulk',
  'write_module_text', 'write_module_markdown', 'replace_text_range', 'write_image_caption',
  'add_module', 'add_child_module', 'rename_module', 'rename_card',
  'remove_module', 'remove_content_block', 'move_module', 'move_content_block',
  'place_module', 'set_module_layout', 'set_reading_layout', 'set_module_options',
  'set_card_image', 'clear_card_image', 'insert_owned_image', 'replace_block_image', 'remove_card_resource',
  'save_conversation_image', 'copy_internal_character', 'commit_import',
  'place_internal_character', 'create_internal_character', 'remove_internal_character',
] as const

/** Read/auxiliary card tools that keep a compact labelled row. */
export const CARD_READ_TOOLS = [
  'list_cards', 'read_card', 'read_text_block', 'read_card_image', 'export_card', 'import_card',
] as const

/** All Noven card tool names, for `tool.<name>` locale key lookup. */
export type CardToolName = typeof CARD_WRITE_TOOLS[number] | typeof CARD_READ_TOOLS[number]

/** Injected business face: open the card editor at the saved card. */
export interface CardReceiptInjected {
  readonly openCard: (cardId: string) => void
}

type T = (key: NovenShellLocaleKey, vars?: Record<string, string | number>) => string

/** 中文标签（locale 键 tool.<name>）；非卡工具沿用原名。 */
function toolLabel(t: T, name: string): string {
  return t(`tool.${name}` as NovenShellLocaleKey)
}

/** One slim in-transcript row: glyph + label + state affordance. */
function CompactRow({ icon, label, detail, tone }: {
  icon: React.ReactNode
  label: string
  detail?: string | undefined
  tone?: 'run' | 'error' | 'done' | undefined
}) {
  return (
    <div className="nv-toolrow" data-tone={tone}>
      <span className="nv-toolrow-icon" aria-hidden>{icon}</span>
      <span className="nv-toolrow-label">{label}</span>
      {detail !== undefined && <span className="nv-toolrow-detail">{detail}</span>}
    </div>
  )
}

/**
 * Keyed toolview for card tools: a compact labelled row inside the folded
 * process group for running, failed, and settled calls alike.
 */
export function CardToolView({ phase, block, toolName, t }: ToolCallViewProps & PropsLocale<'novenShell'>) {
  const label = toolLabel(t, toolName)
  if (phase !== 'result') {
    return <CompactRow icon={glyph.file(13)} label={label} detail={t('tool.running')} tone="run" />
  }
  if (block.isError) {
    const reason = block.error?.reason ?? block.error?.code
    return <CompactRow icon={glyph.file(13)} label={label} detail={reason ?? t('tool.failed')} tone="error" />
  }
  return <CompactRow icon={glyph.file(13)} label={label} tone="done" />
}

type TailProps = PropsRuntime<'conversation.chat.turnTail'>
  & InjectFace<CardReceiptInjected>
  & PropsLocale<'novenShell'>

function ReceiptRow({ result, openCard, t }: {
  result: SavedCardResult
  openCard: CardReceiptInjected['openCard']
  t: T
}) {
  const { meta, tool } = result
  const cardName = meta.card_name ?? meta.target_id ?? ''
  const kindKey = meta.card_kind === 'CHARACTER' ? 'card.kind.character' : 'card.kind.world'
  return (
    <div className="nv-receipt">
      <span className="nv-receipt-check" aria-hidden>{glyph.check(12)}</span>
      <div className="nv-receipt-body">
        <div className="nv-receipt-title">
          {t('receipt.saved', { card: cardName })}
          <span className="nv-receipt-kind">{t(kindKey)}</span>
        </div>
        <div className="nv-receipt-sub">{t('receipt.sub', { tool: toolLabel(t, tool) })}</div>
      </div>
      <div className="nv-receipt-actions">
        {meta.root_id !== undefined && (
          <button type="button" className="nv-receipt-btn" onClick={() => { openCard(meta.root_id ?? '') }}>
            {t('receipt.open')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Render the cards one Turn saved as standalone receipt cards beneath its
 * closing prose. The Turn tail is a list seat independent of the Turn's
 * process disclosure, so the cards stay visible while the tool group is
 * collapsed. Every list entry renders for every Turn, so this one narrows its
 * own Turn here.
 */
export function CardReceiptTail(props: TailProps) {
  const matched = selectSavedCards(props)
  if (matched === null) return null
  return (
    <div className="nv-receipt-list">
      {matched.saved.map(result => (
        <ReceiptRow key={result.callId} result={result} openCard={props.openCard} t={props.t} />
      ))}
    </div>
  )
}
