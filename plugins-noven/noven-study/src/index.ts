/**
 * noven-study — the /study command and its backing skill.
 *
 * Host half only: registers the runtime skill the model invokes through the
 * `skill` tool, plus the `/study` slash command whose handler queues the
 * model turn that triggers it.
 * @module noven-study
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  NOVEN_STUDY_DESCRIPTION,
  NOVEN_STUDY_SKILL_NAME,
  NOVEN_STUDY_SKILL_SOURCE,
  NOVEN_STUDY_WHEN_TO_USE,
} from './skill.ts'

export const name = 'noven-study'
export const inject = ['commands', 'skills']

/** Compose the model turn that starts one study run. */
function studyPrompt(rawInput: string): string {
  const focus = rawInput.trim()
  return focus.length > 0
    ? `使用技能 ${NOVEN_STUDY_SKILL_NAME} 完成研究任务。学习范围与目标：${focus}`
    : `使用技能 ${NOVEN_STUDY_SKILL_NAME} 完成研究任务：观察当前项目，学习其中的资料与参考图片。`
}

/** Register the runtime skill and the /study command. */
export function apply(ctx: Context): void {
  ctx.skills.register({
    name: NOVEN_STUDY_SKILL_NAME,
    description: NOVEN_STUDY_DESCRIPTION,
    whenToUse: NOVEN_STUDY_WHEN_TO_USE,
    content: NOVEN_STUDY_SKILL_SOURCE,
    source: 'runtime',
    invocation: { modelInvocable: true, userInvocable: true },
  })

  ctx.commands.register({
    name: 'study',
    description: '学习项目资料或指定参考，提炼可复用的设定、文风、画风与生图指南',
    input: { hint: '[学习目标或范围]' },
    handler: (invocation) => {
      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: studyPrompt(invocation.rawInput) }],
        source: { kind: 'user' },
      }))
      return { kind: 'success', text: 'Study 已开始，请查看对话进展。' }
    },
  })
}
