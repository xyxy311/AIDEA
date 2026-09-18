/**
 * vendor.mjs —— 宿主依赖（SDK_VENDOR）的 vendor 产物生成（dev.mjs / build-electron.mjs 共用）。
 * loadVendorContract 一并 export，供 scripts/package-plugin.mjs 复用（读取 external 清单 SDK_VENDOR）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §6。
 * 对 SDK_VENDOR 四个包（vue/pinia/naive-ui/konva）各用 esbuild bundle 成单文件 ESM：
 * - 入口动态生成：export * from '<pkg>' + namespace default（插件可能用任一形态导入）；
 * - format 'esm' / bundle true / platform 'browser'；产物名对齐 VENDOR_FILE；
 * - external: SDK_VENDOR（四包互相 external）：naive-ui/pinia 内部的 import 'vue' 保留 bare，
 *   运行时由 index.html import map 网状解析——彻底消灭 vendor 内部嵌套的 vue 副本
 *   （双副本会导致插件组件上下文断裂的根因之一）；
 * - define process.env.NODE_ENV：vue/pinia/naive-ui 的 ESM 版本按它分叉 dev/prod 行为，
 *   不替换则产物带裸 process 引用，浏览器端直接崩；
 * - define vue esm-bundler feature flags（__VUE_OPTIONS_API__ 等）：vue 产物从不经 vite 编译，
 *   缺 flag 引用会直接 ReferenceError，浏览器执行即在第一处分支崩。
 *
 * SDK_VENDOR / VENDOR_FILE 来自 electron/shared/vendor.ts（契约冻结：一处定义三处使用）。
 * .mjs 不能直接 import .ts——先经 esbuild 把契约文件转成临时 .mjs 再动态 import。
 *
 * CLI 直跑：node scripts/vendor.mjs [outDir]（默认 public/vendor，dev:web 前置步骤）。
 */
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

/** 仓库根（scripts/ 的上一级） */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 读取 electron/shared/vendor.ts 的 SDK_VENDOR / VENDOR_FILE。
 * 经 esbuild 转译到 OS 临时目录后动态 import（同进程只调用一次，缓存开销可忽略）。
 */
export async function loadVendorContract() {
  const tmpDir = path.join(os.tmpdir(), 'aidea-vendor-contract')
  await fs.mkdir(tmpDir, { recursive: true })
  const outfile = path.join(tmpDir, 'vendor-constants.mjs')
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'electron', 'shared', 'vendor.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  })
  return import(pathToFileURL(outfile).href)
}

/**
 * 生成 vendor 产物。
 * @param outDir 输出目录（dev: public/vendor；build: dist/vendor——不经 public，绕开与 vite build 的时序耦合）
 * @param mode   NODE_ENV 注入值；统一 production（vendor 供插件运行时共享，development 版体积大且带噪音警告；
 *               如需调试库源码可临时传 'development'）
 */
export async function generateVendor(outDir, mode = 'production') {
  const { SDK_VENDOR, VENDOR_FILE } = await loadVendorContract()
  await fs.mkdir(outDir, { recursive: true })

  for (const pkg of SDK_VENDOR) {
    // 动态入口：export * 与 namespace default 双形态，插件作者两种导入习惯都能工作
    const contents = `export * from '${pkg}';\nimport * as ns from '${pkg}';\nexport default ns;\n`
    await esbuild.build({
      stdin: {
        contents,
        resolveDir: ROOT, // 裸导入从仓库根的 node_modules 解析
        sourcefile: `${pkg}-vendor-entry.js`,
        loader: 'js',
      },
      outfile: path.join(outDir, VENDOR_FILE[pkg]),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      // 四包互相 external（自身除外）：包间依赖（naive-ui/pinia -> vue 等）保留 bare import，
      // 由 import map 网状解析，vendor 内部不嵌任何 SDK 副本；自身不可 external——
      // 入口正是自 pkg 的 re-export，自 external 会产出空壳自引用循环
      external: SDK_VENDOR.filter((p) => p !== pkg),
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        // vue esm-bundler feature flags：vendor 产物不经 vite/打包器编译，缺 flag 直接 ReferenceError
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
      logLevel: 'warning',
    })
    console.log(`[vendor] ${pkg} -> ${path.join(path.relative(ROOT, outDir), VENDOR_FILE[pkg])}`)
  }
}

// CLI 直跑：node scripts/vendor.mjs [outDir]（outDir 相对仓库根，默认 public/vendor）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateVendor(path.resolve(ROOT, process.argv[2] ?? path.join('public', 'vendor'))).catch((err) => {
    console.error('[vendor] 生成失败：', err)
    process.exit(1)
  })
}
