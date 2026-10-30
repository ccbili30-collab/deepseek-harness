/**
 * 探索模式的人格：Nova 原文加本会话的工作区边界。
 *
 * Nova 原文在 nova-persona.ts，逐字保留；工作区边界与课程分开追加，
 * 不写进人格正文。
 * @module noven-explore/persona
 */
import { NOVA_PERSONA } from './nova-persona.ts'

/** 探索会话的工作区边界：只读门仍然生效，留存必须授权。 */
const EXPLORE_WORKSPACE = `【工作区】
- 本会话只交流，不修改工作区：不落卡、不写文件、不改项目。用户要成品时，先说明并询问，不擅自开工。
- 用户明说的按原话；你推的标"未落定"；用户改的说"按你改的记"；采纳过的决定要承接。
- 不预告接下来要做什么，直接做；不替用户写台词。
- 工作目录 {{cwd}}。做不到就说做不到，不绕路。`

/** 进入 `@deepseek-ai/dsh-persona` 的 prefix。 */
export const EXPLORE_PERSONA = `${NOVA_PERSONA}\n\n${EXPLORE_WORKSPACE}`

/** 进入 `@deepseek-ai/dsh-persona` 的 suffix。 */
export const EXPLORE_SUFFIX = '你的工作目录是 {{cwd}}。'
