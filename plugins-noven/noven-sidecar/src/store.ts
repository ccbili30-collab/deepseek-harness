/**
 * 实体库落盘：应用侧账本 `~/.noven/ledger/<id>/sidecar/`——项目级共享，
 * 会话间累积，不放在项目文件夹里等清空。旧的 `.noven/sidecar/` 首次访问时
 * 整体搬入。写入走临时文件 + rename，读不到或损坏回空库。
 * @module noven-sidecar/store
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ledgerDirSync, liftTreeSync } from 'noven-ledger'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { emptySidecarData, type SidecarData } from './model.ts'

export class SidecarStore {
  constructor(readonly root: string) {}

  private get dir(): string {
    const dir = join(ledgerDirSync(this.root), 'sidecar')
    liftTreeSync(join(this.root, '.noven', 'sidecar'), dir)
    return dir
  }
  private get file(): string { return join(this.dir, 'entities.json') }
  private get adminFile(): string { return join(this.dir, 'admin.json') }
  private get callsFile(): string { return join(this.dir, 'calls.jsonl') }

  /** 读取实体库；文件缺失或损坏返回空库。 */
  load(): SidecarData {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SidecarData>
      return {
        revision: raw.revision ?? 0,
        nextId: raw.nextId ?? 1,
        ...(raw.paused === true ? { paused: true } : {}),
        cursors: raw.cursors ?? {},
        ...(raw.sessionPaused !== undefined ? { sessionPaused: raw.sessionPaused } : {}),
        entities: raw.entities ?? [],
        relations: raw.relations ?? [],
      }
    } catch {
      return emptySidecarData()
    }
  }

  /** 写回实体库。 */
  save(data: SidecarData): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 1))
    renameSync(tmp, this.file)
  }

  /** 项目管理员会话的编号；未记录或损坏返回 undefined。 */
  adminSession(): SessionId | undefined {
    try {
      const raw = JSON.parse(readFileSync(this.adminFile, 'utf8')) as { sessionId?: string }
      return typeof raw.sessionId === 'string' ? raw.sessionId as SessionId : undefined
    } catch {
      return undefined
    }
  }

  /** 记录或清除项目管理员会话的编号。 */
  saveAdminSession(sessionId: SessionId | undefined): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = `${this.adminFile}.tmp`
    writeFileSync(tmp, JSON.stringify(sessionId === undefined ? {} : { sessionId }))
    renameSync(tmp, this.adminFile)
  }

  /** 记一次消化派发进 calls.jsonl——派发审计不进会话日志。 */
  appendCall(record: { readonly kind: 'digest'; readonly session?: string; readonly forwarded?: number; readonly admin?: string; readonly error?: string }): void {
    mkdirSync(this.dir, { recursive: true })
    appendFileSync(this.callsFile, JSON.stringify({ ...record, at: new Date().toISOString() }) + '\n')
  }
}
