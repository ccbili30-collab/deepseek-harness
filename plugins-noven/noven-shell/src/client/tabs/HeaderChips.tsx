/**
 * 会话顶栏卡片标签 — the 项目 / 背景 / 管理 chips on the conversation header
 * (design 01b/06c). Clicking 管理 opens a small card holding what the narrow
 * 本会话 rail otherwise carries: answer identity, background, managed objects.
 * Fixture-backed until the session↔card link layer lands.
 * @module noven-shell/client/tabs/HeaderChips
 */
import { useEffect, useRef, useState } from 'react'
import type { ShellT } from '../pages/Home.tsx'
import { asset } from '../data.ts'

interface Props { readonly t: ShellT }

export function HeaderChips({ t }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span ref={root} className="nv-hchips">
      <span className="nv-tag">项目 · 青玄门</span>
      <span className="nv-tag">{t('ctx.background')}</span>
      <button className="nv-tag nv-hchips-btn" data-active={open} onClick={() => setOpen(v => !v)}>
        管理 · 青玄门
      </button>
      {open && (
        <span className="nv-hchips-pop">
          <span className="nv-hchips-sec">
            <em>{t('ctx.identity')}</em>
            <span className="nv-ctx-row"><span className="nv-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>检</span>检票员</span>
          </span>
          <span className="nv-hchips-sec">
            <em>{t('ctx.background')}</em>
            <span className="nv-ctx-row"><img className="nv-ctx-thumb" style={{ width: 26, height: 26 }} src={asset('cover-yunshang.webp')} alt="" />住在云上的第七天</span>
          </span>
          <span className="nv-hchips-sec">
            <em>{t('ctx.managing')}</em>
            <span className="nv-ctx-row"><img className="nv-ctx-thumb" style={{ width: 26, height: 26 }} src={asset('cover-qingxuan.webp')} alt="" />青玄门<small className="nv-tag">{t('ctx.editable')}</small></span>
          </span>
        </span>
      )}
    </span>
  )
}
