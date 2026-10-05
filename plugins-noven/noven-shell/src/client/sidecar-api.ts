/**
 * `/api/noven-sidecar` 的客户端——实体库读取、人工操作（收下/略过/改描述/
 * 自动整理开关）与管理员会话编号。对话流不走这里：pane 直接订阅管理员
 * 会话的事件、发送走正常 prompt 通道。
 * @module noven-shell/client/sidecar-api
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface SidecarEntityView {
  readonly id: string
  readonly kind: 'character' | 'place' | 'system' | 'item' | 'other'
  readonly name: string
  readonly note: string
  readonly status: 'draft' | 'confirmed'
}

export interface SidecarRelationView {
  readonly from: string
  readonly to: string
  readonly label: string
}

export interface SidecarPayload {
  readonly revision: number
  readonly entities: readonly SidecarEntityView[]
  readonly relations: readonly SidecarRelationView[]
  /** 这个 workspace 关了自动整理。 */
  readonly paused?: boolean
  /** 项目管理员会话——下半区对话流订阅的就是这条真会话。 */
  readonly adminSessionId?: SessionId
}

export type SidecarOp =
  | { readonly op: 'confirm' | 'dismiss'; readonly id: string }
  | { readonly op: 'note'; readonly id: string; readonly note: string }
  | { readonly op: 'paused'; readonly paused: boolean }

const api = (sessionId: SessionId): string => `/api/noven-sidecar?session=${encodeURIComponent(sessionId)}`

/** Fetch the workspace entity store for one session. */
export async function fetchSidecar(sessionId: SessionId): Promise<SidecarPayload | undefined> {
  const response = await fetch(api(sessionId)).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return await response.json() as SidecarPayload
}

/** Apply one human operation against the entity store. */
export async function sidecarOp(sessionId: SessionId, op: SidecarOp): Promise<boolean> {
  const response = await fetch(api(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: sessionId, ...op }),
  }).catch(() => undefined)
  return response?.ok === true
}
