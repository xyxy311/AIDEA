/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { SDK_VENDOR } from './electron/shared/vendor'

/**
 * SDK 单实例（设计依据 docs/Electron桌面化实施蓝图.md §6/§9）：
 * vue/pinia/naive-ui/konva 四包必须全仓库单实例——宿主与插件共享同一模块副本
 * （两个 Vue 副本 = 插件组件上下文断裂）。
 *
 * - development：零特殊配置，回归 vite 原生行为——插件（dev 下经 dev-server URL
 *   /plugins/<id>/plugin.js transform 装载，见 sources/desktop.ts 的 loader 分支）
 *   与宿主共享同一套预打包产物，单实例由 vite 模块图天然保证。
 *   ⚠ 不要尝试用 resolve.alias 把 SDK 归一到 /vendor/*.js：alias 走 @rollup/plugin-alias
 *   语义，alias 值会按「文件路径」继续 resolve 而非当作 URL 替换——指向不存在的
 *   <root>/vendor/*.js 时所有 SDK import 直接 Pre-transform error（已踩坑）。
 *   dev 归一不经过 import map。
 * - build（非 dev/test）：SDK 声明 rollup external，宿主产物保留 bare import，
 *   运行时由 index.html 的 import map 解析到 /vendor/*.js（dist/vendor），与插件
 *   （协议原生加载 → bare → import map）同一实例；宿主构建产物零 SDK 内容。
 * - test：vitest 的 mode 是 'test'，build 分支不命中，现有测试不受影响。
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  const isTest = mode === 'test'
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    // build：SDK external，bare import 留给 import map（dev 走 vite 原生预打包，无需配置）
    ...(!isDev && !isTest
      ? {
          build: {
            rollupOptions: {
              external: (id) => SDK_VENDOR.some((p) => id === p || id.startsWith(p + '/')),
            },
          },
        }
      : {}),
    test: {
      environment: 'happy-dom',
      // 纯桌面形态：预置恒在桥的全局测试桩（见 test/setup.ts），供经桌面桥的模块加载即用
      setupFiles: ['./test/setup.ts'],
    },
  }
})
