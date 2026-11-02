/** Shared inline-code acceptance document and real image fixtures. */

export const DOCUMENT = {
  version: 1,
  component: 'stack',
  children: [
    { component: 'text', text: '先让 **阿七** 出场，再决定下一段剧情。' },
    { component: 'icon', name: 'chat', text: '初遇对话' },
    {
      component: 'dialogue',
      turns: [
        { speaker: '阿七', role: '修钟匠', portrait: 'inline-aqi.svg', text: '别碰那根指针。' },
        { speaker: '闻灯', role: '守夜人', text: '你为什么还能记得？' },
      ],
    },
    { component: 'narration', context: '钟楼 · 雨夜', text: '雨水沿着破裂的玻璃斜进来。', thought: '这一次不能再忘记。' },
    { component: 'story-panel', src: 'inline-scene.svg', alt: '雨夜钟楼', caption: '指针倒转', text: '阿七的影子停在原地。' },
    {
      component: 'choices',
      title: '下一段剧情',
      group: '剧情分支',
      options: [
        { id: 'trust', label: '相信阿七', description: '共同检查指针。' },
        { id: 'test', label: '要求证明', description: '先验证一次记忆抹除。' },
      ],
    },
    {
      component: 'split',
      children: [
        { component: 'canon-diff', title: '设定修订', subject: '阿七', before: '耳坠只是纪念物', after: '耳坠储存记忆', group: '耳坠设定' },
        { component: 'conflict-list', items: [{ text: '钟楼 23:00 封锁，但阿七 23:40 到岗。', refs: ['钟楼规则', '阿七日程'] }] },
      ],
    },
    {
      component: 'frame',
      title: '表情差分',
      children: [{
        component: 'media-grid',
        group: '初遇表情',
        items: [{ id: 'stern', src: 'inline-aqi.svg', alt: '阿七警惕表情', label: '警惕' }],
      }],
    },
    { component: 'badge', text: '视觉方向', tone: 'accent' },
    {
      component: 'palette',
      group: '角色主色',
      colors: [
        { id: 'mint', name: '灰薄荷', value: '#789486' },
        { id: 'brass', name: '旧黄铜', value: '#B08B52' },
        { id: 'ink', name: '雨夜青', value: '#344745' },
      ],
    },
    {
      component: 'split',
      children: [
        { component: 'stat', label: '时间共鸣', value: 72, unit: '/ 100', note: '初遇峰值' },
        { component: 'meter', label: '钟楼稳定度', value: 64 },
      ],
    },
    { component: 'bar-chart', title: '四区时间裂缝', unit: '起', data: [{ label: '北塔', value: 68 }, { label: '旧港', value: 52 }] },
    { component: 'line-chart', title: '共鸣变化', unit: '强度', data: [{ label: '到场', value: 18 }, { label: '倒转', value: 43 }, { label: '共识', value: 72 }] },
    {
      component: 'radar-chart',
      title: '阿七能力轮廓',
      data: [{ label: '感知', value: 86 }, { label: '共情', value: 72 }, { label: '意志', value: 78 }, { label: '表达', value: 54 }, { label: '战斗', value: 43 }, { label: '隐匿', value: 68 }],
    },
    { component: 'media', src: 'inline-scene.svg', alt: '钟楼全景', aspect: 3, fit: 'cover' },
  ],
}

export const AQI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 190"><rect width="180" height="190" fill="#e6ebe5"/><path d="M20 190Q25 139 67 132h46q42 10 47 58" fill="#789486"/><path d="M74 118v21q16 12 32 0v-24" fill="#e8c9b6"/><ellipse cx="90" cy="86" rx="43" ry="51" fill="#e8c9b6"/><path d="M46 76Q43 30 89 27q41 0 47 37-25-2-48-21-15 23-42 33" fill="#283c3a"/><path d="M67 91q6-4 12 0m22 0q6-4 12 0M80 112q10 4 20-1" fill="none" stroke="#283c3a" stroke-width="3" stroke-linecap="round"/><path d="M68 132l22 25-25 17m47-42L90 157l25 17" fill="#789486" stroke="#b08b52" stroke-width="2"/></svg>'
export const SCENE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 350"><rect width="800" height="350" fill="#dfe5e2"/><path d="M0 286l120-48 94 28 121-52 139 36 134-49 192 46v103H0" fill="#9da9a1"/><path d="M302 280V96l48-42 48 42v184" fill="#596a62"/><path d="M286 100h128l-64-62" fill="#596a62"/><circle cx="350" cy="133" r="35" fill="#dfe5e2" stroke="#355e49" stroke-width="5"/><path d="M350 105v29l-21 17" stroke="#355e49" stroke-width="4"/><path d="M0 306q180-28 360 3t440-13v54H0" fill="#43554c"/><g stroke="#818278" stroke-width="2" opacity=".45"><path d="M52 15L20 92M138 0L98 94M230 20l-40 92M450 4l-39 95M560 12l-39 94M734 0l-38 94"/></g><circle cx="332" cy="208" r="15" fill="#283c3a"/><path d="M308 284q3-57 24-59 23 3 26 59" fill="#789486"/><circle cx="536" cy="218" r="15" fill="#3b3032"/><path d="M511 288q3-52 25-54 22 2 25 54" fill="#6d4a50"/></svg>'

/** Stable committed-session fixture for the keyless Web snapshot lane. */
export function snapshotSessionFixture(): string {
  const first = '第一组正文。\n' + `::view${JSON.stringify({
    block: 'code',
    data: {
      version: 1,
      component: 'choices',
      group: '第一组',
      options: [{ id: 'a', label: '选甲' }, { id: 'b', label: '选乙' }],
    },
  })}` + '\n继续说明。'
  const second = '第二组正文。\n' + `::view${JSON.stringify({
    block: 'code',
    data: {
      version: 1,
      component: 'choices',
      group: '第二组',
      options: [{ id: 'c', label: '选丙' }, { id: 'd', label: '选丁' }],
    },
  })}` + '\n两组选择互不替换。'
  const third = '完整组件示例。\n' + `::view${JSON.stringify({ block: 'code', data: DOCUMENT })}` + '\n组件只表达当前消息。'
  const contents = [first, second, third]
  const events = [
    { type: 'session', version: 4, id: '{{session:1}}', createdAt: 0, cwd: '{{cwd}}', isSeeded: false, delegationDepth: 0, agentPreset: 'create' },
    { type: 'permission/preset', data: { preset: 'workspace-write' } },
    { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
    { type: 'approval/policy', data: { policy: 'ask' } },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    {
      type: 'system/message',
      data: {
        turn: 1, step: 1,
        message: {
          role: 'system',
          content: [{ type: 'text', text: '{{system}}' }],
          source: { kind: 'system-prompt' },
          id: '{{message:1}}',
        },
      },
      surfaceOp: 'append',
    },
    {
      type: 'user/message',
      data: {
        content: [{ type: 'text', text: '展示两个独立正文块和全部内联组件。' }],
        source: { kind: 'user', rpcId: '{{rpc:1}}', clientTimeZone: '{{clientTimeZone}}' },
        role: 'user',
        id: '{{message:2}}',
      },
      surfaceOp: 'append',
    },
    {
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'assistant',
          content: contents.map(text => ({ type: 'text', text })),
          source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' },
          id: '{{message:3}}',
        },
        stream: [
          ...contents.flatMap((text, index) => [
            { type: 'chunk', time: 0, chunk: { type: 'block-start', index, blockType: 'text' } },
            { type: 'text-chunks', time0: 0, index, dt: [], texts: [text] },
            { type: 'chunk', time: 0, chunk: { type: 'block-end', index, block: { type: 'text', text } } },
          ]),
          { type: 'chunk', time: 0, chunk: { type: 'finish', reason: { kind: 'stop' } } },
        ],
      },
      surfaceOp: 'append',
    },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  return events.map(event => JSON.stringify(event)).join('\n') + '\n'
}

/** Build one closed Session containing the code document and optional module refs. */
export function sessionFixture(moduleSources: readonly string[] = []): string {
  const directive = `::view${JSON.stringify({ block: 'code', data: DOCUMENT })}`
  const modules = moduleSources.map(src => `::view${JSON.stringify({ block: 'module', src })}`).join('\n')
  const answer = `先看出场与选择。\n${directive}${modules === '' ? '' : `\n${modules}`}\n组件只表达当前消息，不创建展示文件。`
  const events = [
    { version: 3, isSeeded: false, createdAt: 0, cwd: '{{cwd}}', delegationDepth: 0, type: 'session', id: '{{session:1}}' },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    {
      type: 'system/message', surfaceOp: 'append',
      data: { turn: 1, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'Noven inline code fixture' }], source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }, id: 'system-inline-code' } },
    },
    {
      type: 'user/message', surfaceOp: 'append',
      data: { content: [{ type: 'text', text: '展示角色初遇和设定选择。' }], source: { kind: 'user', rpcId: 'fixture-user' }, role: 'user', id: 'user-inline-code' },
    },
    {
      type: 'assistant/message', surfaceOp: 'append',
      data: {
        turn: 1, step: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: answer }], source: { provider: 'fixture', model: 'fixture', kind: 'model' }, id: 'assistant-inline-code' },
        stream: [
          { type: 'chunk', time: 0, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
          { type: 'text-chunks', time0: 0, index: 0, dt: [0], texts: [answer] },
          { type: 'chunk', time: 0, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: answer } } },
          { type: 'chunk', time: 0, chunk: { type: 'finish', reason: { kind: 'stop' } } },
        ],
      },
    },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  return events.map(event => JSON.stringify(event)).join('\n')
}
