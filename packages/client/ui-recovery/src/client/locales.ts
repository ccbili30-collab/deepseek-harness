/** Recovery-center UI dictionaries. */
export const NS = 'recovery'

/** Simplified Chinese Recovery Center messages. */
export const zh = {
  'trigger': '恢复与回档',
  'quickTitle': '电源菜单',
  'title': '恢复中心',
  'description': '检查点保存在 DSH 目录之外。恢复会安全关闭并重启 DSH。',
  'settingsNav': '恢复与回档',
  'settingsTitle': '恢复与回档',
  'settingsIntro': '管理外部检查点、校验完整性，并选择要恢复的版本。',
  'sourceLocation': 'DSH 源码',
  'storeLocation': '检查点目录',
  'create': '创建当前检查点',
  'creating': '正在创建…',
  'quickCreated': '已创建：{id}',
  'quickNoCheckpoint': '还没有可用于回档的检查点。',
  'empty': '还没有检查点。建议在修改源码或安装插件前创建一个。',
  'unavailable': '当前不可创建或恢复：{reason}',
  'verify': '校验',
  'verified': '校验通过',
  'restore': '回档',
  'shutdown': '关闭 DeepSeek Harness',
  'quickRestoreConfirm': '回档到最近的检查点？',
  'quickRestoreAction': '确认回档',
  'quickShutdownConfirm': '关闭 DeepSeek Harness？',
  'quickShutdownAction': '确认关闭',
  'cancel': '取消',
  'confirmTitle': '确认关闭并回档？',
  'confirmHint': '输入检查点 ID 以确认。系统会先创建救援检查点，再关闭、恢复并重启 DSH。',
  'confirmPlaceholder': '输入完整检查点 ID',
  'confirmAction': '关闭并回档',
  'restarting': '恢复任务已交给 guardian；DSH 即将关闭并重启。',
  'stopping': 'DSH 正在安全关闭。',
  'manual': '手动',
  'preRestore': '恢复前救援',
  'corrupt': '损坏',
  'files': '{count} 个文件',
} as const

/** Translation keys owned by the Recovery Center namespace. */
export type RecoveryKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { recovery: RecoveryKey }
}

/** English Recovery Center messages. */
export const en = {
  'trigger': 'Recovery',
  'quickTitle': 'Power menu',
  'title': 'Recovery Center',
  'description': 'Checkpoints live outside DSH. A restore safely stops and restarts DSH.',
  'settingsNav': 'Recovery',
  'settingsTitle': 'Recovery & rollback',
  'settingsIntro': 'Manage external checkpoints, verify integrity, and choose a version to restore.',
  'sourceLocation': 'DSH source',
  'storeLocation': 'Checkpoint store',
  'create': 'Create current checkpoint',
  'creating': 'Creating…',
  'quickCreated': 'Created: {id}',
  'quickNoCheckpoint': 'There is no checkpoint available to restore.',
  'empty': 'No checkpoints yet. Create one before editing source or installing plugins.',
  'unavailable': 'Create and restore are unavailable: {reason}',
  'verify': 'Verify',
  'verified': 'Verified',
  'restore': 'Restore',
  'shutdown': 'Shut down DeepSeek Harness',
  'quickRestoreConfirm': 'Restore the latest checkpoint?',
  'quickRestoreAction': 'Confirm restore',
  'quickShutdownConfirm': 'Shut down DeepSeek Harness?',
  'quickShutdownAction': 'Shut down',
  'cancel': 'Cancel',
  'confirmTitle': 'Stop DSH and restore?',
  'confirmHint': 'Type the checkpoint ID to confirm. A rescue checkpoint is created before DSH stops, restores, and restarts.',
  'confirmPlaceholder': 'Type the full checkpoint ID',
  'confirmAction': 'Stop and restore',
  'restarting': 'The guardian accepted the restore. DSH will now stop and restart.',
  'stopping': 'DSH is shutting down safely.',
  'manual': 'Manual',
  'preRestore': 'Pre-restore rescue',
  'corrupt': 'Corrupt',
  'files': '{count} files',
} satisfies Record<RecoveryKey, string>
