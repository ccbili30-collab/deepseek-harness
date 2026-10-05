/**
 * Shared card-tile inner surfaces. `ExcerptTile` fills a coverless tile with
 * the card's own first page — module name plus leading body text, clipped by
 * the tile's bottom fade — so a card without art still shows its content
 * instead of an empty placeholder.
 * @module noven-shell/client/cardtile
 */

/** Paper-page excerpt for a coverless card tile. */
export function ExcerptTile({ module, text }: { readonly module: string; readonly text: string }) {
  return (
    <span className="nv-slot-excerpt">
      <span className="nv-slot-excerpt-mod">{module}</span>
      <span className="nv-slot-excerpt-body">{text}</span>
    </span>
  )
}
