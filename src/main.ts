import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import Konva from 'konva'
import App from './App.vue'
import './assets/main.css'
import { usePluginStore } from '@/stores/plugin'
import { reloadI18n, subscribeI18nChanges } from '@/i18n/loader'
import { installMcpHost } from '@/mcp/host'

// Konva 全局画布像素密度：默认 stage canvas 按像素比 1 渲染，
// 在 DPR>1 的高分屏会被拉大导致画布内容模糊（而 HTML 组件由浏览器自动高清化）。
// 统一按设备 DPR 高清渲染（封顶 2 上限，兼顾清晰度与高分屏下像素数平方级增长的性能开销）。
Konva.pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))

const app = createApp(App)

app.use(createPinia())
app.use(VueKonva)

// 运行时 i18n 装载：默认界面语言是运行时语言 en-US，必须先装载再 mount，
// 否则首帧按默认语言渲染时命中不到包、回退中文（闪中文再切英文）。装载后持续订阅目录变更热登记。
async function boot(): Promise<void> {
  await reloadI18n()
  app.mount('#app')
  void usePluginStore().init()
  // Agent MCP 宿主：订阅工具请求、发布清单、上报窗口态（非桌面形态 no-op）
  installMcpHost()
}

void boot()
subscribeI18nChanges(() => {
  void reloadI18n()
})
