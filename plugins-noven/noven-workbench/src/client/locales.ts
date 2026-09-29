/**
 * The gallery's copy, both shipped languages.
 * @module noven-workbench/client/locales
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Gallery chrome: chips, modes, the annotation editor, the color picker. */
    novenWorkbench: NovenWorkbenchKey
  }
}

const zh = {
  'type.label': '诺文展厅',
  'guide.title': '诺文展厅',
  'guide.description': '浏览工作台成果：图片展厅、批注与取色',
  'loadFailed': '读取失败',
  'refresh': '刷新',
  'empty.noRegistry': '还没有工作台。让助手执行 register_workbench 把项目里的一个目录注册进来。',
  'empty.noImages': '这个工作台目录里还没有图片。',
  'back': '返回',
  'pinned': '置顶',
  'docs': '文档',
  'mode.view': '浏览',
  'mode.annotate': '批注',
  'mode.pick': '取色',
  'annotate.hint': '在图上按住拖出一个框，松开后填写说明。',
  'annotate.editor': '批注说明',
  'annotate.save': '保存',
  'annotate.cancel': '取消',
  'annotate.delete': '删除',
  'annotate.empty': '还没有批注',
  'annotate.saveFailed': '批注保存失败',
  'pick.hint': '点击图片任意位置取色。',
  'pick.copy': '复制',
  'pick.copied': '已复制',
  'pick.recent': '最近取色',
  'pick.unavailable': '这张图无法取色（SVG 矢量图）。',
} as const

export type NovenWorkbenchKey = keyof typeof zh

const en: Record<NovenWorkbenchKey, string> = {
  'type.label': 'Noven gallery',
  'guide.title': 'Noven gallery',
  'guide.description': 'Browse workbench outputs: image gallery, annotations, color picking',
  'loadFailed': 'failed to load',
  'refresh': 'Refresh',
  'empty.noRegistry': 'No workbenches yet. Ask the assistant to run register_workbench on a project folder.',
  'empty.noImages': 'No images in this workbench folder yet.',
  'back': 'Back',
  'pinned': 'Pinned',
  'docs': 'Documents',
  'mode.view': 'View',
  'mode.annotate': 'Annotate',
  'mode.pick': 'Pick',
  'annotate.hint': 'Drag a box on the image, then write its note.',
  'annotate.editor': 'Annotation note',
  'annotate.save': 'Save',
  'annotate.cancel': 'Cancel',
  'annotate.delete': 'Delete',
  'annotate.empty': 'No annotations yet',
  'annotate.saveFailed': 'Failed to save annotation',
  'pick.hint': 'Click anywhere on the image to pick a color.',
  'pick.copy': 'Copy',
  'pick.copied': 'Copied',
  'pick.recent': 'Recent picks',
  'pick.unavailable': 'Color picking unavailable for this image (SVG).',
}

export { en, zh }
