/**
 * build-electron.mjs —— 桌面生产构建（package.json "build:desktop" 的第二步，跟在 npm run build 之后）：
 *   ① 产 vendor 到 dist/vendor/（直接产 dist，不经 public——绕开与 vite build 的时序耦合：
 *      本脚本在 vite build 清空 dist 之后运行，写入不会被覆盖，vite 流程零改动）
 *   ①.5 打包 AI 插件 → plugins/ai/plugin.js（生产桌面包同样需要 AI 插件产物，协议装载，蓝图 §9）
 *   ② esbuild 产 dist-electron/main.cjs + preload.cjs（与 dev watch 同构；minify 关闭便于排查，
 *      需要减小体积时打开）
 *
 * 不打包安装器（electron-builder 属蓝图 M4）。
 */
import path from 'node:path'
import esbuild from 'esbuild'
import { ROOT, generateVendor } from './vendor.mjs'
import { packagePlugin } from './package-plugin.mjs'

async function main() {
  // ① vendor → dist/vendor
  await generateVendor(path.join(ROOT, 'dist', 'vendor'))

  // ①.5 AI 插件产物：生产桌面包同样需要 AI 插件产物，协议装载（蓝图 §9）
  await packagePlugin('ai')

  // ② main/preload：与 dev.mjs 的 esbuild 配置同构（仅去 watch/sourcemap）
  await esbuild.build({
    entryPoints: [
      { in: path.join(ROOT, 'electron/main/index.ts'), out: 'main' },
      { in: path.join(ROOT, 'electron/preload/index.ts'), out: 'preload' },
    ],
    outdir: path.join(ROOT, 'dist-electron'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    outExtension: { '.js': '.cjs' },
    minify: false, // M1 内部 dogfood：保留可读产物便于真机排查；M4 打包发布时可改 true
    logLevel: 'info',
  })
  console.log('[build-electron] 完成：dist-electron/main.cjs、preload.cjs + dist/vendor/*.js')
}

main().catch((err) => {
  console.error('[build-electron] 构建失败：', err)
  process.exit(1)
})
