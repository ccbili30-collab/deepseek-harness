/** One immutable recovery checkpoint exposed to the local browser UI. */
export interface RecoveryCheckpoint {
  readonly id: string
  readonly createdAt: string
  readonly reason: 'manual' | 'pre-restore'
  readonly label: string
  readonly sourceFiles: number
  readonly dshFiles: number
  readonly status: 'published' | 'corrupt'
  readonly error: string
}

/** Point-in-time recovery-center state. */
export interface RecoveryOverview {
  readonly available: boolean
  readonly sourceRoot: string
  readonly storeRoot: string
  readonly checkpoints: readonly RecoveryCheckpoint[]
  readonly unavailableReason: string
}

/** Result of creating one checkpoint. */
export interface RecoveryCreateResult {
  readonly id: string
  readonly files: number
  readonly bytes: number
}

/** Result of verifying one checkpoint. */
export interface RecoveryVerifyResult {
  readonly id: string
  readonly valid: boolean
  readonly files: number
  readonly bytes: number
}

/** Receipt returned before the current Host shuts down. */
export interface RecoveryRestoreReceipt {
  readonly accepted: boolean
  readonly snapshot: string
  readonly logPath: string
}

/** Receipt returned before a user-requested clean Host shutdown. */
export interface RecoveryShutdownReceipt {
  readonly accepted: boolean
}
