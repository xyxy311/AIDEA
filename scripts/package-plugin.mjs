/**
 * package-plugin.mjs —— 内置 AI 插件打包管线（packagePlugin 可复用，dev.mjs / build-electron.mjs 共用）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §9——桌面版一切插件经 aidea-plugin 协议从 plugins/ 目录
 * 装载，且桌面运行态内置源恒空集（§4），因此内置 AI 插件也必须打包出 plugins/ai/plugin.js 产物
 * （gitignored），由 dev.mjs（每次 dev 启动重打一次）与 build-electron.mjs（生产桌面包）共同调用。
 *
 * 打包要点：
 * - external 清单 = SDK_VENDOR（electron/shared/vendor.ts 契约，经 vendor.mjs 的 loadVendorContract
 *   读取，一处定义多处使用）：vue/pinia/naive-ui/konva 与宿主共享同一 vendor 产物，不重复打进插件；
 * - SFC（<template>/<style scoped>）必须由 vite（@vitejs/plugin-vue）打包，esbuild 不支持 SFC；
 *   插件源码以 @/ 引用宿主 SDK（@/plugin/adapter），须携带 @ -> src/ 的 alias；
 * - emptyOutDir 显式 false：outDir 就在项目内（plugins/<id>/），vite 默认清空 outDir 会删光插件全部源码；
 * - CSS 内联后处理：SFC 的 <style scoped> 会被抽成独立 .css 产物，而协议入口只加载 plugin.js，
 *   CSS 不会自动加载，故把新增 .css 以注入代码形式追加到 plugin.js 末尾（运行时 document 存在才插入），
 *   然后删除该 .css 文件，目录内只留 plugin.js；
 * - 产物用 esbuild transform 做语法校验，校验失败即打包失败。
 * - 桌面形态的插件装载走 aidea-plugin:// 协议 + 目录扫描（见 src/plugin/sources/desktop.ts），
 *   不再维护 web 静态清单 plugins/index.json（web 形态已删除）。
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import esbuild from 'esbuild'
import { ROOT, loadVendorContract } from './vendor.mjs'

/**
 * 打包内置插件 plugins/<id>/index.ts -> plugins/<id>/plugin.js（external=SDK_VENDOR，CSS 内联注入）。
 * @param id 插件目录名（当前唯一内置插件为 'ai'）
 */
export async function packagePlugin(id) {
  const { SDK_VENDOR } = await loadVendorContract()
  const pluginDir = path.join(ROOT, 'plugins', id)
  const outFile = path.join(pluginDir, 'plugin.js')

  // 打包前记录顶层条目，打包后 diff 出本次新增（SFC <style scoped> 抽出的 .css、
  // 以及任何非预期产物如 chunk/vendor 目录）——目录内最终只留 plugin.js
  const pluginDirBefore = new Set(await fs.readdir(pluginDir))
  const existingCss = new Set([...pluginDirBefore].filter((name) => name.endsWith('.css')))

  await build({
    configFile: false, // 独立 lib 配置，不读 vite.config.ts（renderer 配置零改动）
    plugins: [vue()],
    publicDir: false, // ⚠️ 禁止把 public/（含 vendor 产物）复制进插件目录——vite build 默认会拷 publicDir
    resolve: { alias: { '@': path.resolve(ROOT, 'src') } },
    build: {
      lib: {
        entry: path.join(ROOT, 'plugins', id, 'index.ts'),
        formats: ['es'],
        fileName: () => 'plugin.js',
      },
      outDir: pluginDir,
      emptyOutDir: false, // ⚠️ 关键：outDir 在项目内，vite 默认会清空它＝删除插件全部源码，必须显式 false
      rollupOptions: {
        external: (pid) => SDK_VENDOR.some((p) => pid === p || pid.startsWith(p + '/')),
      },
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      cssCodeSplit: false,
    },
    logLevel: 'info',
  })

  // CSS 内联后处理：diff 新增 .css，注入代码追加到 plugin.js 末尾后删除 css 文件
  const after = await fs.readdir(pluginDir)
  const newCss = after.filter((name) => name.endsWith('.css') && !existingCss.has(name))
  if (newCss.length > 0) {
    const chunks = []
    for (const name of newCss) {
      chunks.push(await fs.readFile(path.join(pluginDir, name), 'utf8'))
    }
    const css = chunks.join('\n')
    // JSON.stringify(css) 保证引号/换行安全；document 不存在（无 DOM 环境）则跳过插入
    const inject =
      `;(function(){if(typeof document==='undefined')return;var s=document.createElement('style');` +
      `s.setAttribute('data-aidea-plugin','${id}');s.textContent=${JSON.stringify(css)};` +
      `document.head.appendChild(s);})();\n`
    await fs.appendFile(outFile, inject)
    for (const name of newCss) {
      await fs.unlink(path.join(pluginDir, name))
    }
    console.log(`[package-plugin] ${id}：已内联注入 SFC 样式（${newCss.length} 个 .css，删除残留）`)
  } else {
    console.log(`[package-plugin] ${id}：无新增 .css，跳过样式注入`)
  }

  // 自愈清理：删除本次打包新增的一切非 plugin.js 条目（如 vite 行为变化产出的 chunk / vendor
  // 目录、既往残留），保证插件目录内只有源码 + plugin.js（扫描器只认 plugin.js/index.js/index.mjs）
  const extras = after.filter((name) => name !== 'plugin.js' && !newCss.includes(name) && !pluginDirBefore.has(name))
  for (const name of extras) {
    await fs.rm(path.join(pluginDir, name), { recursive: true, force: true })
  }
  if (extras.length > 0) {
    console.log(`[package-plugin] ${id}：已清理非产物条目：${extras.join('、')}`)
  }

  // 产物语法校验：读回全文 transform，抛错即打包失败（缺分号/坏 import 等在构建期拦下）
  const code = await fs.readFile(outFile, 'utf8')
  await esbuild.transform(code, { loader: 'js', format: 'esm' })

  const size = (await fs.stat(outFile)).size
  console.log(`[package-plugin] ${id} -> plugins/${id}/plugin.js（${(size / 1024).toFixed(1)} KB）`)
}

// CLI 直跑：node scripts/package-plugin.mjs [id]（默认 ai）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  packagePlugin(process.argv[2] ?? 'ai').catch((err) => {
    console.error('[package-plugin] 打包失败：', err)
    process.exit(1)
  })
}
