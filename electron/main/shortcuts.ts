/**
 * shortcuts.ts —— 无边框窗口的快捷键兜底（attachWindowShortcuts）：
 * Menu.setApplicationMenu(null) 会带走默认菜单 role 的 accelerator，使编辑快捷键与
 * devtools 失效；此处用 before-input-event 在 webContents 层拦截并转发恢复。
 * 原则：只处理确需兜底的按键，其余一律放行。
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

    // 开发期 devtools：用 app.isPackaged 而非 NODE_ENV（打包后 NODE_ENV 不可靠）；
    // 支持 F12 与 Ctrl+Shift+I 两套习惯。
    if (!app.isPackaged) {
      const isDevtoolsKey = input.code === 'F12' || (input.control && input.shift && input.code === 'KeyI')
      if (isDevtoolsKey) {
        win.webContents.toggleDevTools()
        event.preventDefault()
        return
      }
    }

    // 编辑快捷键：Ctrl（Windows/Linux）/ Meta（macOS）+ 编辑键
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
