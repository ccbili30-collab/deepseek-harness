/**
 * noven-draw-comic — the /draw-comic command and its backing skill bundle.
 *
 * Host half only: activation materializes the bundle (references, the two
 * deterministic scripts, the interactive viewer) under ~/.noven/skills/noven-draw-comic/,
 * registers the runtime skill, and wires the /draw-comic slash command.
 * @module noven-draw-comic
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { NOVEN_SKILL_FILES } from './assets.ts'
import {
  NOVEN_SKILL_DESCRIPTION,
  NOVEN_SKILL_NAME,
  NOVEN_SKILL_SOURCE,
  NOVEN_SKILL_WHEN_TO_USE,
} from './skill.ts'

export const name = 'noven-draw-comic'
export const inject = ['commands', 'skills']

/** The bundle's on-disk home; the skill text points the model here. */
export function skillDirectory(): string {
  return join(homedir(), '.noven', 'skills', NOVEN_SKILL_NAME)
}

/** Materialize the bundle once per activation; files are small, writes are idempotent. */
async function materialize(): Promise<void> {
  const root = skillDirectory()
  for (const [rel, base64] of Object.entries(NOVEN_SKILL_FILES)) {
    const target = join(root, rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, Buffer.from(base64, 'base64'))
  }
}

/** Compose the model turn that starts one draw-comic run. */
function prompt(rawInput: string): string {
  const focus = rawInput.trim()
  return focus.length > 0
    ? `使用技能 ${NOVEN_SKILL_NAME} 完成任务。${focus}`
    : `使用技能 ${NOVEN_SKILL_NAME} 完成任务：阅读当前项目的世界观与地理资料，产出成品。`
}

/** Register the runtime skill, the bundle on disk, and the /draw-comic command. */
export function apply(ctx: Context): void {
  ctx.effect(() => materialize().then(() => () => {}), 'noven-draw-comic: bundle materialization')

  ctx.skills.register({
    name: NOVEN_SKILL_NAME,
    description: NOVEN_SKILL_DESCRIPTION,
    whenToUse: NOVEN_SKILL_WHEN_TO_USE,
    content: NOVEN_SKILL_SOURCE,
    source: 'runtime',
    invocation: { modelInvocable: true, userInvocable: true },
  })

  ctx.commands.register({
    name: 'draw-comic',
    description: "把可读故事改编成分镜连续、作画统一、字模分离的漫画页",
    input: { hint: "[要改编的章节或故事范围]" },
    handler: (invocation) => {
      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: prompt(invocation.rawInput) }],
        source: { kind: 'user' },
      }))
      return { kind: 'success', text: "Draw-comic 已开始，请查看对话进展。" }
    },
  })
}
