/**
 * vendor.ts —— 宿主依赖 external 清单与产物约定。插件打包时宿主依赖必须 external
 * （双 vue 副本 = 组件上下文断裂），bare import 由宿主 import map 解析到 /vendor/<pkg>.js。
 * 红线：只增不减，新增须评审（须能被 esbuild bundle 为无副作用 ESM 单文件）。
 */
export const SDK_VENDOR = ['vue', 'pinia', 'naive-ui', 'konva'] as const

/** vendor 产物文件名约定（与 index.html import map 对齐，改这里必须同步改 import map） */
export const VENDOR_FILE: Record<(typeof SDK_VENDOR)[number], string> = {
  vue: 'vue.js',
  pinia: 'pinia.js',
  'naive-ui': 'naive-ui.js',
  konva: 'konva.js',
}
