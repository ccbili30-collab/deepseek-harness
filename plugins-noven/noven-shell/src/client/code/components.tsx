/**
 * Product renderers for the inline code document vocabulary. Structure and
 * chart geometry come from the approved demo; content, assets, and interaction
 * outcomes come from typed node props rather than hardcoded example scenes.
 * @module noven-shell/client/code/components
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { glyph } from '../icons.tsx'
import type { CodeChoice, CodeChoiceCommitter } from './choices.ts'
import { commitCodeChoice } from './choices.ts'
import type { CodeIconName } from './icon-names.ts'
import type { CodeNode } from './model.ts'
import { css } from './classes.ts'

/** Locale-owned host labels used by built-in component chrome. */
export interface CodeComponentCopy {
  readonly before: string
  readonly after: string
  readonly accept: string
  readonly keep: string
  readonly choice: (group: string, label: string) => string
  readonly revision: (group: string, label: string, value: string) => string
}

/** Services and identity available to every inline component node. */
export interface CodeComponentProps {
  readonly node: CodeNode
  readonly blockId: string
  readonly labels: MarkdownLabels
  readonly copy: CodeComponentCopy
  readonly resolveMedia: (src: string) => string | undefined
  readonly commit?: CodeChoiceCommitter | undefined
}

const ICONS: Readonly<Record<CodeIconName, (size?: number) => ReactNode>> = {
  globe: glyph.globe, planet: glyph.planet, user: glyph.user, users: glyph.users,
  clock: glyph.clock, layers: glyph.layers, code: glyph.code, bolt: glyph.bolt,
  sparkle: glyph.sparkle, map: glyph.map, book: glyph.book, image: glyph.image,
  heart: glyph.heart, bookmark: glyph.bookmark, fork: glyph.fork, file: glyph.file,
  grid: glyph.grid, folder: glyph.folder, chat: glyph.chat, search: glyph.search,
  plus: glyph.plus, check: glyph.check, edit: glyph.edit, brush: glyph.brush,
  castle: glyph.castle, route: glyph.route, flag: glyph.flag, eye: glyph.eye,
  phone: glyph.phone, wrench: glyph.wrench,
}

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function assertNever(value: never): never {
  throw new Error(`noven-shell: unsupported inline code component ${String(value)}`)
}

function Title({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className={css.title}>{glyph.layers(15)}<strong>{children}</strong></div>
}

function MediaImage({ src, alt, aspect, fit = 'cover', className = '', resolveMedia }: {
  readonly src: string
  readonly alt: string
  readonly aspect?: number | undefined
  readonly fit?: 'cover' | 'contain' | undefined
  readonly className?: string | undefined
  readonly resolveMedia: (src: string) => string | undefined
}): ReactNode {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  const url = resolveMedia(src)
  const classes = `${css.mediaImage} ${fit === 'contain' ? css.contain : css.cover} ${className}`
  const style = aspect === undefined ? undefined : { aspectRatio: String(aspect) }
  if (url === undefined || failed) {
    return <div className={`${classes} ${css.mediaFallback}`} style={style} role="img" aria-label={alt}>{glyph.image(18)}<span>{alt}</span></div>
  }
  return <img className={classes} style={style} src={url} alt={alt} loading="lazy" onError={() => { setFailed(true) }} />
}

function useElementWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const update = (): void => {
      const next = Math.round(element.clientWidth)
      setWidth(current => current === next ? current : next)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])
  return [ref, width]
}

function Choices({ node, blockId, commit, copy }: CodeComponentProps & { readonly node: Extract<CodeNode, { readonly component: 'choices' }> }): ReactNode {
  const [selected, setSelected] = useState<string>()
  return (
    <section className={css.frame}>
      {node.title !== undefined && <Title>{node.title}</Title>}
      <div className={css.choices}>
        {node.options.map((option, index) => {
          const choice: CodeChoice = {
            group: node.group,
            optionId: option.id,
            label: option.label,
            text: copy.choice(node.group, option.label),
          }
          return (
            <button
              type="button"
              className={css.choice}
              key={option.id}
              disabled={commit === undefined}
              aria-pressed={selected === option.id}
              onClick={() => {
                if (commit !== undefined && commitCodeChoice(commit, blockId, choice)) setSelected(option.id)
              }}
            >
              <span className={css.choiceKey}>{String.fromCharCode(65 + index)}</span>
              <span>{option.label}{option.description !== undefined && <small>{option.description}</small>}</span>
              <span className={css.choiceCheck}>{glyph.check(15)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MediaGrid({ node, blockId, commit, copy, resolveMedia }: CodeComponentProps & { readonly node: Extract<CodeNode, { readonly component: 'media-grid' }> }): ReactNode {
  const [selected, setSelected] = useState<string>()
  return (
    <div className={css.mediaGrid}>
      {node.items.map(item => {
        const interactive = node.group !== undefined && commit !== undefined
        const content = (
          <>
            <MediaImage src={item.src} alt={item.alt} aspect={1} resolveMedia={resolveMedia} />
            <span className={css.mediaLabel}><span className={css.choiceCheck}>{glyph.check(14)}</span>{item.label}</span>
          </>
        )
        if (!interactive) return <div className={css.mediaItem} key={item.id}>{content}</div>
        const group = node.group
        return (
          <button
            type="button"
            className={css.mediaItem}
            key={item.id}
            aria-pressed={selected === item.id}
            onClick={() => {
              if (commitCodeChoice(commit, blockId, {
                group, optionId: item.id, label: item.label, text: copy.choice(group, item.label),
              })) setSelected(item.id)
            }}
          >{content}</button>
        )
      })}
    </div>
  )
}

function Palette({ node, blockId, commit, copy }: CodeComponentProps & { readonly node: Extract<CodeNode, { readonly component: 'palette' }> }): ReactNode {
  const [selected, setSelected] = useState<string>()
  return (
    <div className={css.palette}>
      {node.colors.map(color => {
        const content = (
          <>
            <span className={css.swatch} style={{ backgroundColor: color.value }} />
            <span className={css.colorLabel}><strong>{color.name}</strong><span>{color.value}</span></span>
          </>
        )
        if (node.group === undefined || commit === undefined) return <div className={css.color} key={color.id}>{content}</div>
        const group = node.group
        return (
          <button
            type="button"
            className={css.color}
            key={color.id}
            aria-pressed={selected === color.id}
            onClick={() => {
              if (commitCodeChoice(commit, blockId, {
                group, optionId: color.id, label: color.name, text: copy.choice(group, `${color.name} ${color.value}`),
              })) setSelected(color.id)
            }}
          >{content}</button>
        )
      })}
    </div>
  )
}

function CanonDiff({ node, blockId, commit, copy }: CodeComponentProps & { readonly node: Extract<CodeNode, { readonly component: 'canon-diff' }> }): ReactNode {
  const [selected, setSelected] = useState<'accept' | 'keep'>()
  const choose = (optionId: 'accept' | 'keep'): void => {
    if (commit === undefined) return
    const accepted = optionId === 'accept'
    const label = accepted ? copy.accept : copy.keep
    const value = accepted ? node.after : node.before
    if (commitCodeChoice(commit, blockId, {
      group: node.group,
      optionId,
      label,
      text: copy.revision(node.group, label, value),
    })) setSelected(optionId)
  }
  return (
    <section className={css.frame}>
      {node.title !== undefined && <Title>{node.title}</Title>}
      <div className={css.diffRow}><span>{node.subject}</span><span>{node.group}</span></div>
      <div className={css.diffRow}><span>{copy.before}</span><span className={css.old}>{node.before}</span></div>
      <div className={css.diffRow}><span>{copy.after}</span><span className={css.new}>{node.after}</span></div>
      <div className={css.actions}>
        <button type="button" className={css.action} disabled={commit === undefined} aria-pressed={selected === 'accept'} onClick={() => { choose('accept') }}>{glyph.check(14)}{copy.accept}</button>
        <button type="button" className={css.action} disabled={commit === undefined} aria-pressed={selected === 'keep'} onClick={() => { choose('keep') }}>{copy.keep}</button>
      </div>
    </section>
  )
}

function LineChart({ node }: { readonly node: Extract<CodeNode, { readonly component: 'line-chart' }> }): ReactNode {
  const [ref, measured] = useElementWidth()
  const width = measured || 360
  const height = 220
  const margin = { left: 42, right: 16, top: 18, bottom: 42 }
  const innerWidth = Math.max(1, width - margin.left - margin.right)
  const innerHeight = height - margin.top - margin.bottom
  const max = node.max ?? Math.max(1, ...node.data.map(item => item.value))
  const x = (index: number): number => margin.left + index / (node.data.length - 1) * innerWidth
  const y = (value: number): number => margin.top + innerHeight - Math.min(value, max) / max * innerHeight
  const tickCount = Math.min(node.data.length, width < 410 ? 3 : 6)
  const ticks = [...new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index * (node.data.length - 1) / Math.max(1, tickCount - 1))))]
  const points = node.data.map((item, index) => `${x(index)},${y(item.value)}`).join(' ')
  const last = node.data.length - 1
  return (
    <div className={css.chart} ref={ref}>
      {node.title !== undefined && <Title>{node.title}</Title>}
      <svg className={css.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={node.title ?? node.component}>
        {Array.from({ length: 5 }, (_, index) => index / 4).map(scale => {
          const value = max * scale
          return <g key={scale}><line x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} className={css.gridLine} /><text x={margin.left - 8} y={y(value) + 4} textAnchor="end" className={css.axisText}>{numberText(value)}</text></g>
        })}
        <line x1={margin.left} x2={width - margin.right} y1={margin.top + innerHeight} y2={margin.top + innerHeight} className={css.axisLine} />
        <polyline points={points} className={css.linePath} />
        {node.data.map((item, index) => <circle key={`${item.label}:${index}`} cx={x(index)} cy={y(item.value)} r="4.5" className={css.linePoint} />)}
        {ticks.map(index => <text key={index} x={x(index)} y={height - 20} textAnchor="middle" className={css.axisText}>{node.data[index]?.label}</text>)}
        <text x={x(last) - 3} y={y(node.data[last]?.value ?? 0) - 12} textAnchor="end" className={css.valueText}>{numberText(node.data[last]?.value ?? 0)}</text>
        {node.unit !== undefined && <text x={width - margin.right} y={height - 3} textAnchor="end" className={css.axisText}>{node.unit}</text>}
      </svg>
    </div>
  )
}

function RadarChart({ node }: { readonly node: Extract<CodeNode, { readonly component: 'radar-chart' }> }): ReactNode {
  const [ref, measured] = useElementWidth()
  const width = measured || 360
  const height = 270
  const centerX = width / 2
  const centerY = 130
  const radius = Math.min(90, width / 4.1)
  const max = node.max ?? Math.max(1, ...node.data.map(item => item.value))
  const point = (index: number, value: number, clamp = true): readonly [number, number] => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / node.data.length
    const scaled = radius * (clamp ? Math.min(value, max) : value) / max
    return [centerX + Math.cos(angle) * scaled, centerY + Math.sin(angle) * scaled]
  }
  const polygon = (scale: number): string => node.data.map((_, index) => point(index, max * scale).map(value => value.toFixed(1)).join(',')).join(' ')
  const values = node.data.map((item, index) => point(index, item.value).map(value => value.toFixed(1)).join(',')).join(' ')
  return (
    <div className={css.chart} ref={ref}>
      {node.title !== undefined && <Title>{node.title}</Title>}
      <svg className={css.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={node.title ?? node.component}>
        {[0.25, 0.5, 0.75, 1].map(scale => <polygon key={scale} points={polygon(scale)} className={css.radarGrid} />)}
        {node.data.map((item, index) => {
          const end = point(index, max)
          const label = point(index, max * 1.27, false)
          return <g key={`${item.label}:${index}`}><line x1={centerX} y1={centerY} x2={end[0]} y2={end[1]} className={css.gridLine} /><text x={label[0]} y={label[1] + 4} textAnchor="middle" className={css.radarLabel}>{item.label}</text></g>
        })}
        <polygon points={values} className={css.radarValue} />
        {node.data.map((item, index) => {
          const at = point(index, item.value)
          return <circle key={`${item.label}:${index}`} cx={at[0]} cy={at[1]} r="3.5" className={css.radarPoint} />
        })}
      </svg>
      <div className={css.radarValues}>{node.data.map(item => <span className={css.badge} key={item.label}>{item.label} {numberText(item.value)}</span>)}</div>
    </div>
  )
}

function BarChart({ node }: { readonly node: Extract<CodeNode, { readonly component: 'bar-chart' }> }): ReactNode {
  const max = Math.max(1, ...node.data.map(item => item.value))
  return (
    <section className={css.frame}>
      {node.title !== undefined && <Title>{node.title}</Title>}
      <div className={css.bars}>
        {node.data.map(item => (
          <div className={css.barRow} key={item.label}>
            <span>{item.label}</span>
            <span className={css.track}><span className={css.fill} style={{ width: `${item.value / max * 100}%` }} /></span>
            <span className={css.barValue}>{numberText(item.value)}</span>
          </div>
        ))}
      </div>
      {node.unit !== undefined && <div className={css.chartScale}><span>0</span><span>{numberText(max)} {node.unit}</span></div>}
    </section>
  )
}

/** Render one validated node and its descendants. */
export function CodeComponent(props: CodeComponentProps): ReactNode {
  const { node } = props
  const children = (nodes: readonly CodeNode[]): ReactNode => nodes.map((child, index) => (
    <CodeComponent {...props} node={child} key={`${child.component}:${index}`} />
  ))
  switch (node.component) {
    case 'text': return <MarkdownText text={node.text} labels={props.labels} variant="compact" />
    case 'media': return <MediaImage src={node.src} alt={node.alt} aspect={node.aspect} fit={node.fit} resolveMedia={props.resolveMedia} />
    case 'icon': return <span className={css.iconText}>{ICONS[node.name](16)}{node.text}</span>
    case 'stack': return <div className={css.stack}>{children(node.children)}</div>
    case 'split': return <div className={css.split}>{children(node.children)}</div>
    case 'frame':
      return <section className={`${css.frame} ${node.tone === 'accent' ? css.accent : node.tone === 'warning' ? css.warning : ''}`}>{node.title !== undefined && <Title>{node.title}</Title>}<div className={css.stack}>{children(node.children)}</div></section>
    case 'badge': return <span className={`${css.badge} ${node.tone === 'accent' ? css.accent : node.tone === 'warning' ? css.warning : ''}`}>{node.text}</span>
    case 'media-grid': return <MediaGrid {...props} node={node} />
    case 'palette': return <Palette {...props} node={node} />
    case 'dialogue':
      return (
        <section className={css.dialogue}>
          {node.turns.map((turn, index) => {
            const placement = turn.placement ?? (index % 2 === 0 ? 'left' : 'right')
            return (
              <div className={`${css.turn} ${placement === 'right' ? css.reverse : ''}`} key={`${turn.speaker}:${index}`}>
                {turn.portrait !== undefined
                  ? <MediaImage src={turn.portrait} alt={`${turn.speaker}${turn.expression ?? ''}`} className={css.portrait} resolveMedia={props.resolveMedia} />
                  : <div className={`${css.portrait} ${css.portraitFallback}`} aria-hidden="true">{turn.speaker.slice(0, 1)}</div>}
                <div className={css.speech}>
                  <div className={css.speaker}><strong>{turn.speaker}</strong>{turn.role !== undefined && <span className={css.badge}>{turn.role}</span>}{turn.expression !== undefined && <span className={css.badge}>{turn.expression}</span>}</div>
                  <p className={css.line}>{turn.text}</p>
                </div>
              </div>
            )
          })}
        </section>
      )
    case 'narration':
      return <section className={css.narration}>{node.context !== undefined && <div className={css.context}>{glyph.clock(14)}{node.context}</div>}<p>{node.text}</p>{node.thought !== undefined && <em>{node.thought}</em>}</section>
    case 'story-panel':
      return <section className={css.story}><MediaImage src={node.src} alt={node.alt} aspect={16 / 7} resolveMedia={props.resolveMedia} /><div className={css.caption}>{glyph.book(17)}<p><strong>{node.caption}</strong>{node.text}</p></div></section>
    case 'canon-diff': return <CanonDiff {...props} node={node} />
    case 'choices': return <Choices {...props} node={node} />
    case 'conflict-list':
      return <div className={css.conflicts}>{node.items.map((item, index) => <div className={css.conflict} key={`${item.text}:${index}`}>{glyph.bolt(17)}<div><p>{item.text}</p>{item.refs !== undefined && <span className={css.badges}>{item.refs.map(ref => <span className={css.badge} key={ref}>{ref}</span>)}</span>}</div></div>)}</div>
    case 'stat':
      return <section className={css.frame}><div className={css.context}>{node.label}</div><div className={css.stat}><strong>{numberText(node.value)}</strong>{node.unit !== undefined && <span>{node.unit}</span>}</div>{node.note !== undefined && <p className={css.note}>{node.note}</p>}</section>
    case 'meter': {
      const max = node.max ?? 100
      const value = Math.min(node.value, max)
      return <div className={css.meter}><div className={css.meterHead}><span>{node.label}</span><span>{numberText(node.value)} / {numberText(max)}</span></div><div className={css.track} role="progressbar" aria-label={node.label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><div className={css.fill} style={{ width: `${value / max * 100}%` }} /></div>{node.note !== undefined && <p className={css.note}>{node.note}</p>}</div>
    }
    case 'bar-chart': return <BarChart node={node} />
    case 'line-chart': return <LineChart node={node} />
    case 'radar-chart': return <RadarChart node={node} />
    default: return assertNever(node)
  }
}
