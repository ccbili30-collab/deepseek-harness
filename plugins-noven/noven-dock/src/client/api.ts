/**
 * `/api/noven-dock` 的客户端：查当前会话的配对角色，按需开（fork）挂窗。
 * @module noven-dock/client/api
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface DockInfo {
  readonly role: 'main' | 'dock' | 'none'
  readonly dockId?: SessionId
  readonly mainId?: SessionId
}

const api = (sessionId: SessionId): string => `/api/noven-dock?session=${encodeURIComponent(sessionId)}`

/** 查一条会话在挂窗配对里的角色；路由缺席按 none 之外的不可用处理。 */
export async function fetchDock(sessionId: SessionId): Promise<DockInfo | undefined> {
  const response = await fetch(api(sessionId)).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return (await response.json()) as DockInfo
}

/** 开（或复用）一条主线会话的挂窗；抛错表示 fork 或配对失败。 */
export async function openDock(sessionId: SessionId): Promise<SessionId> {
  const response = await fetch(api(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'open', session: sessionId }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `open failed (${response.status})`)
  return ((JSON.parse(text) as { dockId: string }).dockId) as SessionId
}
