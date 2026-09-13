/**
 * vendor.mjs —— 宿主依赖（SDK_VENDOR）的 vendor 产物生成（dev.mjs / build-electron.mjs 共用）。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md §6。
 * 对 SDK_VENDOR 四个包（vue/pinia/naive-ui/konva）各用 esbuild bundle 成单文件 ESM：
 * - 入口动态生成：export * from '<pkg>' + namespace default（插件可能用任一形态导入）；
 * - format 'esm' / bundle true / platform 'browser'；产物名对齐 VENDOR_FILE；
 * - define process.env.NODE_ENV：vue/pinia/naive-ui 的 ESM 版本按它分叉 dev/prod 行为，
 *   不替换则产物带裸 process 引用，浏览器端直接崩。
 *
 * SDK_VENDOR / VENDOR_FILE 来自 electron/shared/vendor.ts（契约冻结：一处定义三处使用）。
 * .mjs 不能直接 import .ts——先经 esbuild 把契约文件转成临时 .mjs 再动态 import。
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
async function loadVendorContract() {
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
      define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      logLevel: 'warning',
    })
    console.log(`[vendor] ${pkg} -> ${path.join(path.relative(ROOT, outDir), VENDOR_FILE[pkg])}`)
  }
}
