import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueKonva from 'vue-konva'
import Konva from 'konva'
import App from './App.vue'
import './assets/main.css'
import { usePluginStore } from '@/stores/plugin'
import { reloadI18n, subscribeI18nChanges } from '@/i18n/loader'

// Konva 全局画布像素密度：默认 stage canvas 按像素比 1 渲染，
// 在 DPR>1 的高分屏会被拉大导致画布内容模糊（而 HTML 组件由浏览器自动高清化）。
// 统一按设备 DPR 高清渲染（封顶 2 上限，兼顾清晰度与高分屏下像素数平方级增长的性能开销）。
Konva.pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))

const app = createApp(App)

app.use(createPinia())
app.use(VueKonva)

app.mount('#app')

// 引导装载插件（需要 pinia 已安装；run 时间表由启动时的 enabled 快照决定）
void usePluginStore().init()

// 运行时 i18n 装载：启动扫描登记（含 en-US 等运行时资源）+ 订阅目录变更热登记（即插即用）
void reloadI18n()
subscribeI18nChanges(() => {
  void reloadI18n()
})
