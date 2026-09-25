import { nanoid } from 'nanoid'

/** 生成唯一节点 ID（nanoid 21 字符 URL-safe 随机串） */
export function generateId(): string {
  return nanoid()
}
