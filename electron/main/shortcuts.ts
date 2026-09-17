/**
 * shortcuts.ts —— 无边框窗口的快捷键兜底（attachWindowShortcuts）。
 *
 * 背景：main/index.ts 里 Menu.setApplicationMenu(null) 移除了默认菜单 role 的
 * accelerator——编辑快捷键（复制/剪切/粘贴/全选/撤销/重做）与 devtools（F12 等）
 * 全部失效（Electron issue #15373 同类问题：默认菜单删除后 accelerator 随之消失）。
 * 此处按官方 keyboard-shortcuts 教程的 before-input-event 方案，在 webContents 层
 * 拦截并转发到对应 webContents 方法，恢复被菜单删除带走的快捷键。
 *
 * 原则：只处理确需兜底的按键，其余一律放行（不调用 preventDefault，不影响输入法、
 * 页面自身快捷键与系统组合键）。
 */
import { app } from 'electron'
import type { BrowserWindow } from 'electron'

/** 编辑快捷键映射表：按键 code → webContents 方法名（用 input.code 匹配，避免输入法/布局差异） */
const EDIT_KEYS = {
  KeyC: 'copy',
  KeyX: 'cut',
  KeyV: 'paste',
  KeyA: 'selectAll',
  // KeyZ 单独处理：Shift 组合时为 redo，否则为 undo
  KeyZ: 'undo-or-redo',
  KeyY: 'redo',
} as const

/** app ready 后对指定窗口调用一次；窗口关闭后监听随 webContents 一起失效 */
export function attachWindowShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    // 只处理按下动作（keyUp 不拦截）
    if (input.type !== 'keyDown') return

    // —— 开发期 devtools：用 app.isPackaged 而非 NODE_ENV（esbuild 打包后 NODE_ENV 不可靠，
    //    packaged 产物才是真正用户手里的形态；F12 与 Ctrl+Shift+I 两套习惯都支持）——
    if (!app.isPackaged) {
      const isDevtoolsKey = input.code === 'F12' || (input.control && input.shift && input.code === 'KeyI')
      if (isDevtoolsKey) {
        win.webContents.toggleDevTools()
        event.preventDefault()
        return
      }
    }

    // —— 编辑快捷键：Ctrl（Windows/Linux）/ Meta（macOS）+ 编辑键 ——
    const modifier = process.platform === 'darwin' ? input.meta : input.control
    if (!modifier) return

    const method = EDIT_KEYS[input.code as keyof typeof EDIT_KEYS]
    if (!method) return // 其余按键一律放行

    const wc = win.webContents
    switch (method) {
      case 'copy':
        wc.copy()
        break
      case 'cut':
        wc.cut()
        break
      case 'paste':
        wc.paste()
        break
      case 'selectAll':
        wc.selectAll()
        break
      case 'redo':
        wc.redo()
        break
      case 'undo-or-redo':
        // Shift+Ctrl/Cmd+Z = redo，Ctrl/Cmd+Z = undo
        if (input.shift) wc.redo()
        else wc.undo()
        break
    }
    event.preventDefault()
  })
}
