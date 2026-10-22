/**
 * noven-skills — 手机版（Novex）内置技能的桌面移植：文游制作机、卡整理机、
 * 去 AI 痕迹、活人感写作四个目录包技能，加上桌面新增的世界观共创（worldview-coauthor）、创作工具箱（creation-toolbox）
 * 与移植的成长世界教程（growth-world），随产品发行，经 bundled 技能目录进入宿主技能
 * 注册表，所有 agent 的合并目录可见。
 *
 * 宿主半边 only：复用 FileSystemSkillProvider 的扫描/解析/加载，仅把根目录
 * 指向包内 skills/。
 * @module noven-skills
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'

export const name = 'noven-skills'
export const inject = ['skills']

const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

/** Register the bundled Noven skill catalog. */
export function apply(ctx: Context): void {
  let provider!: FileSystemSkillProvider
  ctx.skills.registerProvider((control) => {
    provider = new FileSystemSkillProvider(ctx, control, {
      providerName: 'noven-builtin',
      includeDefaultRoots: false,
      bundledSkillDir: SKILLS_DIR,
      watch: false,
    })
    return provider
  })
  ctx.effect(function* () {
    yield async () => { await provider.dispose() }
  }, 'noven-skills provider')
}
