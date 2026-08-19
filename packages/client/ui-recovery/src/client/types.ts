import type {
  RecoveryCreateResult, RecoveryOverview, RecoveryRestoreReceipt, RecoveryShutdownReceipt,
  RecoveryVerifyResult,
} from '@deepseek-ai/dsh-api-remotes/client'

/** Browser-facing recovery operations injected into the sidebar slot. */
export interface RecoveryCenterFace {
  list: () => Promise<RecoveryOverview>
  create: () => Promise<RecoveryCreateResult>
  verify: (snapshot: string) => Promise<RecoveryVerifyResult>
  restore: (snapshot: string) => Promise<RecoveryRestoreReceipt>
  shutdown: () => Promise<RecoveryShutdownReceipt>
}
