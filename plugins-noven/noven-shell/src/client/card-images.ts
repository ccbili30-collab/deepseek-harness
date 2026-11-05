/**
 * Card image roles shared by the display page and the read-only preview.
 * A role never falls back to a different purpose: the cover stays the page
 * background, a world identity stays its logo, and a character identity stays
 * its avatar. A missing role returns null so the caller can show a placeholder
 * instead of silently reusing another image.
 * @module noven-shell/client/card-images
 */

/** The appearance fields that give a card its cover and identity image. */
export interface CardImageFields {
  readonly kind: string
  readonly coverResourceId: string | null
  readonly avatarResourceId: string | null
  /** Absent on responses from older hosts; treated as no world logo. */
  readonly logoResourceId?: string | null
}

/**
 * Resolve the page cover. It is the only image used behind a card page.
 * @param card - the card or role that owns the page.
 * @returns its cover resource id, or null when it has none.
 */
export function coverImageId(card: Pick<CardImageFields, 'coverResourceId'> | undefined): string | null {
  return card?.coverResourceId ?? null
}

/**
 * Resolve a character's avatar, regardless of the card kind carried by the row.
 * @param character - the character row or role view.
 * @returns its avatar resource id, or null when it has none.
 */
export function avatarImageId(character: Pick<CardImageFields, 'avatarResourceId'> | undefined): string | null {
  return character?.avatarResourceId ?? null
}

/**
 * Resolve the square identity image beside the title.
 * @param card - the card or role that owns the page.
 * @returns a world's logo or a character's avatar; otherwise null.
 */
export function identityImageId(card: CardImageFields | undefined): string | null {
  if (card === undefined) return null
  return card.kind === 'WORLD'
    ? card.logoResourceId ?? null
    : avatarImageId(card)
}
