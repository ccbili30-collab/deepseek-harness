/**
 * Validated entry point for Noven's message-owned inline code documents.
 * Unsupported data produces one controlled notice; it never falls back to raw
 * JSON, an iframe, or an HTML artifact.
 * @module noven-shell/client/code/CodeBlock
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { fmt, type ShellT } from '../pages/Home.tsx'
import { CodeComponent, type CodeComponentCopy } from './components.tsx'
import type { CodeChoiceCommitter } from './choices.ts'
import { validateCodeDocument, type CodeJsonObject } from './model.ts'
import { css } from './classes.ts'

/** Inputs supplied by the Session-scoped inline block renderer. */
export interface InlineCodeBlockProps {
  readonly data: CodeJsonObject
  readonly blockId: string
  readonly resolveMedia: (src: string) => string | undefined
  readonly commit?: CodeChoiceCommitter | undefined
  readonly t: ShellT
}

/**
 * Validate and render one complete inline code document.
 * @param props - Parsed component data, stable block identity, and host services.
 * @returns The component tree or a controlled invalid-content notice.
 */
export function InlineCodeBlock({ data, blockId, resolveMedia, commit, t }: InlineCodeBlockProps): ReactNode {
  const document = useMemo(() => validateCodeDocument(data), [data])
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('conv.md.copy'), copiedLabel: t('conv.md.copied') },
    footnotes: '',
  }), [t])
  const copy = useMemo<CodeComponentCopy>(() => ({
    before: t('code.diff.before'),
    after: t('code.diff.after'),
    accept: t('code.diff.accept'),
    keep: t('code.diff.keep'),
    choice: (group, label) => fmt(t, 'code.choice.commit', { group, label }),
    revision: (group, label, value) => fmt(t, 'code.diff.commit', { group, label, value }),
  }), [t])
  if (document === undefined) return <div className={css.root}><p className={css.invalid} role="status">{t('code.invalid')}</p></div>
  return (
    <div className={css.root}>
      <CodeComponent
        node={document}
        blockId={blockId}
        labels={labels}
        copy={copy}
        resolveMedia={resolveMedia}
        {...(commit === undefined ? {} : { commit })}
      />
    </div>
  )
}
