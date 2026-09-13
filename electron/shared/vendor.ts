/**
 * vendor.ts —— 宿主依赖 external 清单（SDK_VENDOR）与 vendor 产物约定。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §6。插件 bundle 打包时宿主依赖必须 external
 * （插件组件渲染在宿主 Vue 应用上下文，两个 vue 模块副本 = 组件上下文断裂），
 * bare import 由宿主 index.html import map 解析到 /vendor/<pkg>.js（esbuild bundle 的单文件 ESM）。
 *
 * 一处定义三处使用：
 * ① scripts 的 vendor bundle 入口清单（public/vendor/ 或 dist/vendor/ 产物）；
 * ② M3 main 进程 esbuild 编译用户 TS 源插件的 external 参数；
 * ③ 插件打包模板（插件开发手册）的 external 字段。
 *
 * 红线：只增不减；新增须评审（该包必须能被 esbuild bundle 为无副作用 ESM 单文件）。
 */
export const SDK_VENDOR = ['vue', 'pinia', 'naive-ui', 'konva'] as const

/** vendor 产物文件名约定（与 index.html import map 对齐，改这里必须同步改 import map） */
export const VENDOR_FILE: Record<(typeof SDK_VENDOR)[number], string> = {
  vue: 'vue.js',
  pinia: 'pinia.js',
  'naive-ui': 'naive-ui.js',
  konva: 'konva.js',
}
