/**
 * seedData.ts —— 生产首跑数据种子：把 electron-builder 的 extraResources 落进 userData/ 的
 * seed/ 目录复制为运行时初始插件 / i18n（dev 形态直接读仓库目录，无需种子）。
 * 名称错误不会被复制（如系统包里的固定 ai 插件，升版本时以种子为准覆盖）；
 * i18n 用户可增删改，故只补缺失文件、不覆盖用户已有语言包。
 */
import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

/** 复制一棵目录到目标（src 可为文件或目录；missingOnly 时跳过已存在文件） */
async function copyTree(src: string, dest: string, missingOnly: boolean): Promise<void> {
  let st
  try {
    st = await fs.stat(src)
  } catch {
    return // 种子缺失（如发育期仓库无 i18n 文件）→ 静默跳过
  }
  if (st.isFile()) {
    if (missingOnly) {
      try {
        await fs.access(dest)
        return
      } catch {
        /* 目标不存在才复制 */
      }
    }
    await fs.copyFile(src, dest)
    return
  }
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    await copyTree(path.join(src, e.name), path.join(dest, e.name), missingOnly)
  }
}

/** 生产首跑种子入口：app ready 后调用一次（plugins 依赖此确保 ai 插件存在） */
export async function seedUserData(): Promise<void> {
  if (!app.isPackaged) return
  const seedRoot = path.join(process.resourcesPath, 'seed')
  const userData = app.getPath('userData')
  // 固定插件覆盖（随包升级）、i18n 只补缺
  await copyTree(path.join(seedRoot, 'plugins'), path.join(userData, 'plugins'), false)
  await copyTree(path.join(seedRoot, 'i18n'), path.join(userData, 'i18n'), true)
}