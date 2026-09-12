/**
 * hello 插件常量（常量先行：manifest / 组件 / 注册引用同一来源，避免插件 id 硬编码散落）。
 * 组件不得 import 插件入口 index.ts（会被入口 import，构成循环依赖）——对齐 plugins/ai 的约定。
 */

/** 插件 id（须等于目录名 hello） */
export const HELLO_PLUGIN_ID = 'hello'

/** 浮动层短 id（完整登记 key 为 `${HELLO_PLUGIN_ID}:${HELLO_FLOAT_LAYER_ID}`） */
export const HELLO_FLOAT_LAYER_ID = 'float'
