/**
 * 浏览器侧 `node:crypto` 垫片：被内联的品牌库只用到 webcrypto
 * （getRandomValues / subtle）与 randomUUID，浏览器都原生提供。
 */
export const webcrypto = globalThis.crypto

/** @returns 一个随机 UUID（浏览器原生实现）。 */
export const randomUUID = (): string => globalThis.crypto.randomUUID()

export default { webcrypto, randomUUID }
