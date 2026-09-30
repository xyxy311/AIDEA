/**
 * shortcuts.ts —— 无边框窗口的快捷键兜底（attachWindowShortcuts）：
 * Menu.setApplicationMenu(null) 会带走默认菜单 role 的 accelerator，使 devtools 失效；
 * 此处用 before-input-event 在 webContents 层兜底 devtools 开关。
 * 原则：只处理确需兜底的按键，其余一律放行——编辑类快捷键（复制/剪切/粘贴/撤销/重做）
 * 必须放行到渲染层，由 useKeyboardShortcuts 经剪贴板 composable 与命令层历史栈处理：
 * 在 webContents 层拦截并 preventDefault 会吞掉 keydown，原生 wc.copy()/wc.undo() 只作用于
 * DOM 选中与焦点编辑，对 Konva 画布与自定义历史栈无效，导致画布快捷键全部失效。
 */
import { app } from 'electron'
import type { BrowserWindow } from 'electron'

/** app ready 后对指定窗口调用一次；窗口关闭后监听随 webContents 一起失效 */
export function attachWindowShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    // 只处理按下动作（keyUp 不拦截）
    if (input.type !== 'keyDown') return

    // 开发期 devtools：用 app.isPackaged 而非 NODE_ENV（打包后 NODE_ENV 不可靠）；
    // 支持 F12 与 Ctrl+Shift+I 两套习惯。其余按键（含 Ctrl/Cmd+C/X/V/Z/Y 等编辑快捷键）
    // 一律放行给渲染层。
    if (!app.isPackaged) {
      const isDevtoolsKey = input.code === 'F12' || (input.control && input.shift && input.code === 'KeyI')
      if (isDevtoolsKey) {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    }
  })
}
