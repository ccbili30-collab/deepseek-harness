/**
 * noven-shell copy. Product strings live here (locale-owned); components take
 * `t` from their registration's `locale` declaration.
 * @module noven-shell/client/locales
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Noven shell chrome: nav labels, page copy, right-rail tabs. */
    novenShell: NovenShellLocaleKey
  }
}

export const zh = {
  'nav.home': '首页',
  'nav.create': '创作',
  'nav.messages': '消息',
  'nav.me': '我的',
  'tab.context': '本会话',
  'tab.library': '创作库',

  'home.discover': '发现',
  'home.following': '关注',
  'home.filter.all': '全部',
  'home.filter.character': '角色',
  'home.filter.world': '世界',
  'home.enter': '进入世界',
  'home.fork': '以此创作',
  'home.follow': '关注',
  'home.forkedBy': '衍生',
  'home.enterable': '可进入',
  'home.modifiable': '可修改',
  'home.roles': '世界内角色',
  'home.dialogs': '这张卡的对话',

  'create.hero.placeholder': '描述一个世界、一个角色，或一段还没成形的故事——Nova 帮你起笔',
  'create.hero.send': '开始',
  'create.newWorld': '新建世界',
  'create.newWorld.sub': '从空白或模板开始搭一个世界',
  'create.newCharacter': '新建角色',
  'create.newCharacter.sub': '单独的一张角色卡',
  'create.import': '导入卡片',
  'create.import.sub': '导入 .novex 卡片包',
  'create.tools.research': '研究资料',
  'create.tools.map': '画地图',
  'create.tools.comic': '画漫画',
  'create.drafts': '未完成',

  'me.editProfile': '编辑资料',
  'me.newCard': '+ 新建',
  'me.tab.worlds': '世界',
  'me.tab.characters': '角色',
  'me.tab.library': '创作库',
  'me.card.stats': '{roles} 个角色 · {chats} 段会话',
  'me.card.dirty': '有未保存的修改',
  'me.library.all': '全部项目',
  'me.library.recent': '最近产出',
  'me.library.from': '来自会话',
  'me.library.worldCard': '世界卡',
  'me.library.files': '{count} 个文件',

  'messages.empty': '还没有消息',
  'messages.hint': '其他用户的互动通知会出现在这里',

  'editor.modules': '模块',
  'editor.roles': '世界内角色',
  'editor.assets': '图片素材',
  'editor.sidechat.title': '交给 AI',
  'editor.sidechat.hint': '让 Nova 帮你改这张卡',
  'editor.save': '保存',
  'editor.receipt': '已保存到「{card}」',

  'ctx.background': '背景',
  'ctx.identity': '回答身份',
  'ctx.managing': '管理对象',
  'ctx.outputs': '本会话产出',
  'ctx.open': '打开',
  'ctx.editable': '可修改',
  'ctx.empty': '这段会话还没有关联的卡片或产出',

  'library.empty': '这个项目的创作库还是空的',
  'library.hint': '会话产出的地图、人物志、故事集会出现在这里',
} as const

export type NovenShellLocaleKey = keyof typeof zh

export const en: Record<NovenShellLocaleKey, string> = {
  'nav.home': 'Home',
  'nav.create': 'Create',
  'nav.messages': 'Messages',
  'nav.me': 'Me',
  'tab.context': 'Session',
  'tab.library': 'Library',

  'home.discover': 'Discover',
  'home.following': 'Following',
  'home.filter.all': 'All',
  'home.filter.character': 'Characters',
  'home.filter.world': 'Worlds',
  'home.enter': 'Enter World',
  'home.fork': 'Create From It',
  'home.follow': 'Follow',
  'home.forkedBy': 'forks',
  'home.enterable': 'Enterable',
  'home.modifiable': 'Editable',
  'home.roles': 'Characters',
  'home.dialogs': 'Conversations',

  'create.hero.placeholder': 'Describe a world, a character, or a story still taking shape — Nova drafts it with you',
  'create.hero.send': 'Start',
  'create.newWorld': 'New World',
  'create.newWorld.sub': 'Build a world from scratch or a template',
  'create.newCharacter': 'New Character',
  'create.newCharacter.sub': 'A standalone character card',
  'create.import': 'Import Card',
  'create.import.sub': 'Import a .novex card package',
  'create.tools.research': 'Research',
  'create.tools.map': 'Draw Map',
  'create.tools.comic': 'Draw Comic',
  'create.drafts': 'Unfinished',

  'me.editProfile': 'Edit Profile',
  'me.newCard': '+ New',
  'me.tab.worlds': 'Worlds',
  'me.tab.characters': 'Characters',
  'me.tab.library': 'Library',
  'me.card.stats': '{roles} roles · {chats} conversations',
  'me.card.dirty': 'Unsaved changes',
  'me.library.all': 'All projects',
  'me.library.recent': 'Recent outputs',
  'me.library.from': 'from session',
  'me.library.worldCard': 'World card',
  'me.library.files': '{count} files',

  'messages.empty': 'No messages yet',
  'messages.hint': 'Notifications from other users will appear here',

  'editor.modules': 'Modules',
  'editor.roles': 'Characters',
  'editor.assets': 'Image Assets',
  'editor.sidechat.title': 'Hand to AI',
  'editor.sidechat.hint': 'Ask Nova to edit this card',
  'editor.save': 'Save',
  'editor.receipt': 'Saved to “{card}”',

  'ctx.background': 'Background',
  'ctx.identity': 'Answer as',
  'ctx.managing': 'Managing',
  'ctx.outputs': 'Session outputs',
  'ctx.open': 'Open',
  'ctx.editable': 'Editable',
  'ctx.empty': 'This session has no linked cards or outputs yet',

  'library.empty': 'This project’s library is empty',
  'library.hint': 'Maps, character bibles and story collections produced in sessions appear here',
}
