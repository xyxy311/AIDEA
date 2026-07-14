import { nanoid } from 'nanoid'

/**
 * 生成唯一节点 ID
 * nanoid 默认生成 21 字符的 URL-safe 随机字符串
 */
export function generateId(): string {
  return nanoid()
}
