/** Locale bundles for the Noven image-generation settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type NovenImageSettingsLocaleKey =
  | 'title' | 'description'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint'
  | 'model' | 'modelHint'
  | 'outputDir' | 'outputDirHint'
  | 'apiKeyEnv' | 'apiKeyEnvHint'
  | 'overridden' | 'reset' | 'invalidValue' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed'

/** English copy. */
export const en: Record<NovenImageSettingsLocaleKey, string> = {
  title: 'Image generation',
  description: 'Set up the Noven image provider (OpenAI-compatible images API).',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; image tools are unavailable until one is.',
  baseUrl: 'Endpoint',
  baseUrlHint: 'OpenAI-compatible base URL, e.g. https://api.openai.com/v1.',
  model: 'Image model',
  modelHint: 'The model name your provider serves, e.g. gpt-image-1.',
  outputDir: 'Output folder',
  outputDirHint: 'Project folder generated images are saved into.',
  apiKeyEnv: 'Key environment variable',
  apiKeyEnvHint: 'Alternative to the key above: the environment variable to read at boot.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  invalidValue: 'Enter a valid value.',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
}

/** Simplified Chinese copy. */
export const zh: Record<NovenImageSettingsLocaleKey, string> = {
  title: '生图',
  description: '配置诺文生图（OpenAI 兼容图像 API）。',
  apiKey: 'API Key',
  apiKeyHint: '不写入设置文件。留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；配置之前生图工具不可用。',
  baseUrl: '接口地址',
  baseUrlHint: 'OpenAI 兼容基础 URL，如 https://api.openai.com/v1。',
  model: '图像模型',
  modelHint: '服务商提供的模型名，如 gpt-image-1。',
  outputDir: '落盘目录',
  outputDirHint: '生成的图片在项目内保存的文件夹。',
  apiKeyEnv: '密钥环境变量',
  apiKeyEnvHint: '上一项的替代方案：启动时读取的环境变量名。',
  overridden: '已覆盖',
  reset: '恢复默认',
  invalidValue: '请输入有效值。',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '部署未接受这些值；已保留供你修改。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: NovenImageSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
