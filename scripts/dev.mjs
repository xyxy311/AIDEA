/**
 * dev.mjs —— Electron 开发编排（package.json "dev"）：
 *   ① 打包 AI 插件 → plugins/ai/plugin.js（dev 经 dev-server URL transform 装载、生产经协议装载，蓝图 §4/§6/§9）
 *   ② spawn vite（--strictPort 固定 5173；继承 stdio）
 *   ③ 轮询 dev server 就绪
 *   ④ esbuild watch electron/main/** + electron/preload/**（产 dist-electron/*.cjs）
 *   ⑤ 首次构建成功后 spawn electron（env 携带 VITE_DEV_SERVER_URL）
 *
 * 注：vendor 产物仅生产链路需要（import map 解析 SDK bare import），dev 下 SDK 归一走
 * vite 原生预打包/模块图（sources/desktop.ts 的 loader 分支），本编排不再产 vendor。
 *
 * 端口等待策略：vite 以 --strictPort 启动，端口被占时 vite 直接失败退出
 * （不静默漂移到 5174），编排轮询 http://localhost:5173 直至响应（60s 超时报错），
 * 保证 electron 拿到的 VITE_DEV_SERVER_URL 与 vite 实际端口一致。
 *
 * 退出语义：electron 子进程退出 → 清理 vite 与 esbuild watch，整个编排随之退出；
 * SIGINT → 清理全部子进程。main/preload 改动由 esbuild watch 重建（M1 不自动重启
 * electron，重建后手动重启应用生效；自动化热重启列蓝图 M4）。
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import esbuild from 'esbuild'
import { ROOT } from './vendor.mjs'
import { packagePlugin } from './package-plugin.mjs'

const require = createRequire(import.meta.url)
const DEV_SERVER_URL = 'http://localhost:5173'

/**
 * vite 入口物理路径：vite 的 exports 未映射 ./bin/vite.js，require.resolve 会抛
 * ERR_PACKAGE_PATH_NOT_EXPORTED；spawn 子进程按文件系统路径解析，不受 exports 限制。
 */
function resolveViteEntry() {
  const p = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!fs.existsSync(p)) {
    throw new Error(`未找到 vite 入口：${p}（请确认依赖已安装）`)
  }
  return p
}

/** 活跃子进程登记（清理用） */
const children = []
let shuttingDown = false

function killAll() {
  for (const child of children) {
    try {
      child.kill()
    } catch {
      /* 已退出的进程 kill 会抛错，清理路径上忽略 */
    }
  }
}

function exitAll(code) {
  if (shuttingDown) return
  shuttingDown = true
  killAll()
  process.exit(code)
}

/** 轮询 dev server 就绪（任意 HTTP 响应即算就绪；250ms 间隔，60s 超时） */
async function waitForDevServer(url, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      /* 尚未就绪，继续轮询 */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`等待 vite dev server 就绪超时（${timeoutMs}ms）：${url}`)
}

/** esbuild watch 重建完成提示（M1 语义：手动重启 electron 生效） */
const rebuildNotifyPlugin = {
  name: 'aidea-rebuild-notify',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        console.log('[dev] main/preload 已重建；重启 Electron 窗口后生效（M1 不自动重启）')
      }
    })
  },
}

async function main() {
  // ① 内置插件打包：dev 下插件经 dev-server URL transform 装载、生产经协议装载，
  //    两形态都以 plugins/<id>/plugin.js 产物为入口（蓝图 §4/§6/§9）
  await packagePlugin('ai')

  // ② vite：--strictPort 保证端口固定 5173（被占则失败退出，端口不漂移）
  const vite = spawn(process.execPath, [resolveViteEntry(), '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  children.push(vite)
  vite.on('exit', (code) => {
    if (!shuttingDown) {
      console.error('[dev] vite 提前退出，编排终止')
      exitAll(code ?? 1)
    }
  })

  // ③ 等 dev server 就绪（依赖预构建 optimizeDeps 首次可能较慢，超时放宽到 60s）
  await waitForDevServer(DEV_SERVER_URL)

  // ④ esbuild watch：main/preload 源（ESM 编写）直出 .cjs（sandbox preload 兼容 + "type": "module" 下规避 ESM 噪音）
  const ctx = await esbuild.context({
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
    sourcemap: true,
    logLevel: 'info',
    plugins: [rebuildNotifyPlugin],
  })
  await ctx.watch() // 首次构建完成后 resolve（含编译错误场景：错误打印，watch 继续）

  // ⑤ electron：exe 路径由 devDeps 的 electron 包在 node 环境下导出（require('electron') 返回字符串路径）
  const electronExe = require('electron')
  const electron = spawn(electronExe, ['.'], {
    cwd: ROOT, // 读 package.json 的 "main": "dist-electron/main.cjs"
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_SERVER_URL },
    stdio: 'inherit',
  })
  children.push(electron)
  electron.on('exit', (code) => {
    // electron 退出 = 开发会话结束：清理 vite 与 watch，编排退出
    if (shuttingDown) return
    shuttingDown = true
    killAll()
    ctx.dispose().finally(() => process.exit(code ?? 0))
  })
}

process.on('SIGINT', () => {
  exitAll(0)
})

main().catch((err) => {
  console.error('[dev] 编排失败：', err)
  exitAll(1)
})
