/**
 * useT - 轻量文本访问占位层
 *
 * 当前为本地化资源文件的唯一访问入口，从 `@/locales/zh-CN.json` 读取文案。
 * 支持点路径取值（如 `t('menuBar.file')`）与 `{name}` 形参插值。
 *
 * 未来引入 vue-i18n 时，只需把本文件内部实现替换为 vue-i18n 的 t 函数，
 * 调用方（组件 / composable / store）签名零改动；JSON 资源结构直接兼容。
 */
import messages from '@/locales/zh-CN.json'

type Params = Record<string, string | number>

/** 按点路径从对象取值 */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * 取文本。key 形如 `'menuBar.file'`；可选 params 做 `{name}` 插值。
 * 未命中时回退返回 key 本身（便于发现遗漏）。
 */
export function t(key: string, params?: Params): string {
  const raw = getByPath(messages, key)
  let msg = typeof raw === 'string' ? raw : key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, String(v))
    }
  }
  return msg
}
