/**
 * build-web.mjs —— web 生产分发收尾（package.json "build" 的第三步，跟在 vite build 之后）：
 *   ① 产 vendor 到 dist/vendor/（本脚本在 vite build 清空 dist 之后运行，写入不会被覆盖）；
 *   ② 复制插件产物 dist/plugins/<id>/plugin.js + 清单 dist/plugins/index.json（清单读
 *      plugins/index.json，缺失/无效则现场按 package-plugin 的规则扫描 plugins/ 兜底）；
 *   ③ console 汇总。
 *
 * 设计依据：docs/Electron桌面化实施蓝图.md（宿主构建彻底退出 plugins/ 内容）——vite build 不感知
 * 插件，web 形态的插件装载 = renderer 启动时 fetch /plugins/index.json 清单 → import
 * /plugins/<id>/plugin.js（等价于桌面协议的"启动时扫描"，宿主构建产物零插件内容）。
 * 前置：plugins/ 下各插件目录的 plugin.js 须已由 scripts/package-plugin.mjs 产出（npm run dev /
 * build:desktop 自动产；纯 web 构建前手动 node scripts/package-plugin.mjs 亦可）。
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import { ROOT, generateVendor } from './vendor.mjs'
import { scanPluginManifest } from './package-plugin.mjs'

async function main() {
  // ① vendor → dist/vendor（import map 指向 /vendor/*.js，web 分发同样要带上产物）
  await generateVendor(path.join(ROOT, 'dist', 'vendor'))

  // ② 插件产物复制：清单优先读 plugins/index.json，缺失/无效则现场扫描兜底
  let list
  try {
    const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'plugins', 'index.json'), 'utf8'))
    if (!Array.isArray(raw) || raw.some((e) => typeof e?.id !== 'string' || typeof e?.entry !== 'string')) {
      throw new Error('清单结构不符（须为 [{ id, entry }]）')
    }
    list = raw
  } catch {
    console.log('[build-web] plugins/index.json 缺失或无效，现场扫描 plugins/ 兜底')
    list = await scanPluginManifest()
  }

  const distPlugins = path.join(ROOT, 'dist', 'plugins')
  await fs.mkdir(distPlugins, { recursive: true })
  for (const { id, entry } of list) {
    const src = path.join(ROOT, 'plugins', id, entry)
    const destDir = path.join(distPlugins, id)
    await fs.mkdir(destDir, { recursive: true })
    try {
      await fs.copyFile(src, path.join(destDir, entry))
    } catch {
      throw new Error(
        `插件产物缺失：${path.relative(ROOT, src)}（先执行 node scripts/package-plugin.mjs ${id}）`,
      )
    }
  }
  await fs.writeFile(path.join(distPlugins, 'index.json'), JSON.stringify(list, null, 2) + '\n')

  // ③ 汇总
  const ids = list.map((e) => e.id).join('、') || '（无插件）'
  console.log(`[build-web] 完成：dist/vendor（4 包）+ dist/plugins：${ids} + dist/plugins/index.json`)
}

main().catch((err) => {
  console.error('[build-web] 失败：', err)
  process.exit(1)
})
