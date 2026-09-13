/**
 * 插件自有语言包 —— AI 插件的多语言入口（该插件全部文案的唯一解析入口）
 *
 * 产品口径：插件文案不进宿主 locales（src/locales/*.json），归插件文件夹自持。
 * 本文件把 plugins/ai/locales/ 下的 zh-CN.json / en-US.json 组装为插件专属 t。
 * 语言包除插件命名空间分区（aiPanel.* / aiWord.*）外，还内含与宿主 locales 同名
 * 顶层分区的快照（leftSidebar / settings / shortcuts / canvas / viewTextPanel /
 * common，key 字符串与宿主零改动，文案复制自宿主语言包）——因此本插件的注册文案、
 * 设置分区、画布右键、算法下拉等全部 key 均由本 t 解析，消费点不再分流宿主 t。
 *
 * 实现经插件 API 的宿主侧转发：adapter.api.i18n.createT（内部即 src/composables/useT.ts
 * 的 createT 工厂）。createT 是纯工厂、无副作用，模块顶层调用安全。
 * 回退链：插件包当前语言 → 插件包 zh-CN → key 本身；产物内部读 themeStore.locale，
 * 模板 / computed 中调用即自动建立响应式依赖，切换语言热更新。
 */
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import { adapter } from '@/plugin/adapter'

/** 插件自有 t：本插件全部文案（含注册文案与 settings/canvas 等分区）的唯一解析入口 */
export const t = adapter.api.i18n.createT({ 'zh-CN': zhCN, 'en-US': enUS })
