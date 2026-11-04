/** Authored resource and navigation URLs shared by Noven's Markdown and rich-text readers. */
import { useMarkdownDelegate } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMemo, useRef, type MouseEvent } from 'react'

/** A destination owned by a card or workspace-file navigation consumer. */
export type NovenLink =
  | { readonly kind: 'card'; readonly cardId: string; readonly moduleId?: string }
  | { readonly kind: 'file'; readonly path: string }

/** @param href - Authored URL. @returns Its Noven destination, or undefined for malformed or unsupported URLs. */
export function novenLink(href: string): NovenLink | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch (_error) {
    // Authored text may contain an incomplete URL.
    return undefined
  }
  if (url.protocol !== 'noven:' || url.username !== '' || url.password !== '') return undefined
  let parts: string[]
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch (_error) {
    // Invalid percent escapes have no navigation target.
    return undefined
  }
  if (url.hostname === 'card') {
    const cardId = parts[0]
    if (cardId === undefined) return undefined
    if (parts.length === 1) return { kind: 'card', cardId }
    if (parts.length === 3 && parts[1] === 'module' && parts[2] !== undefined) {
      return { kind: 'card', cardId, moduleId: parts[2] }
    }
  }
  if (url.hostname === 'file' && parts.length > 0) return { kind: 'file', path: parts.join('/') }
  return undefined
}

/** @param href - Authored link. @returns Whether it uses an external protocol supported by BlockNote or a validated Noven destination. */
export function documentLinkAllowed(href: string): boolean {
  let url: URL
  try {
    url = new URL(href, 'https://noven.local')
  } catch (_error) {
    // Invalid URL syntax cannot become a link mark.
    return false
  }
  return ['http:', 'https:', 'ftp:', 'ftps:', 'mailto:', 'tel:', 'callto:', 'sms:', 'cid:', 'xmpp:'].includes(url.protocol)
    || novenLink(href) !== undefined
}

/** @param url - Stored image URL. @param imageUrl - Owning card's reader. @returns Display URL without changing stored Markdown. */
export function documentImageUrl(url: string, imageUrl: ((resourceId: string) => string) | undefined): string {
  if (!url.startsWith('card-image:')) return url
  const id = url.slice('card-image:'.length).split('#', 1)[0] ?? ''
  return id === '' ? '' : imageUrl?.(id) ?? ''
}

/**
 * Bind both rich-text editors to their nearest Markdown navigation owner.
 * @param imageUrl - Optional card resource reader.
 * @returns Stable editor options and a capture handler for owner-declared links.
 */
export function useDocumentProtocols(imageUrl?: (resourceId: string) => string): {
  readonly links: { readonly isValidLink: typeof documentLinkAllowed }
  readonly resolveFileUrl: (url: string) => Promise<string>
  readonly onClickCapture: (event: MouseEvent<HTMLDivElement>) => void
} {
  const delegate = useMarkdownDelegate()
  const current = useRef({ delegate, imageUrl })
  current.current = { delegate, imageUrl }
  return useMemo(() => ({
    links: { isValidLink: documentLinkAllowed },
    resolveFileUrl: async url => documentImageUrl(url, current.current.imageUrl),
    onClickCapture: event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      const href = anchor?.getAttribute('href')
      const owner = current.current.delegate
      if (href === undefined || href === null || owner.linkProtocols?.includes('noven:') !== true
        || owner.openLink === undefined || novenLink(href) === undefined) return
      event.preventDefault()
      event.stopPropagation()
      owner.openLink(href)
    },
  }), [])
}
