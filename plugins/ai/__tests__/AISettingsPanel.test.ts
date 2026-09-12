import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { NDialogProvider } from 'naive-ui'
import AISettingsPanel from '../components/AISettingsPanel.vue'
import { useAIConfigStore } from '../stores/aiConfig'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { AI_DEFAULT_CONFIG } from '../constants'
import { t } from '@/composables/useT'

/**
 * AISettingsPanel（「AI 设置」栏目壳：单栏目三分区）挂载冒烟：
 * 分区① AI 连接（AIConnectionSettings 子组件）/ 分区② 快捷键（ShortcutActionRow）/
 * 分区③ 发散方向（AIDirectionsSection 子组件）三区齐渲染，且连接参数直绑仍工作。
 * AIDirectionsSection 内部经 useDialog 挂「恢复默认」确认框 → 外包 NDialogProvider；
 * 分区② 的动作行数据来自 uiRegistry.shortcutActions，先登记一条 ai 插件动作再挂载。
 */
const PanelHost = defineComponent({
  components: { AISettingsPanel, NDialogProvider },
  template: '<NDialogProvider><AISettingsPanel /></NDialogProvider>',
})

describe('AISettingsPanel（AI 设置单栏目三分区）挂载冒烟', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    // 分区② 数据源：登记本插件（ai）的快捷键动作（对齐插件启动时 registerShortcutAction 的登记形态）
    useUiRegistryStore().registerPluginShortcutAction('ai', {
      id: 'generate',
      label: t('shortcuts.actionAIGenerate'),
      scope: 'canvas',
      run: () => undefined,
    })
  })
  afterEach(() => {
    errorSpy.mockClear()
  })

  it('三分区齐渲染：连接 / 快捷键 / 发散方向的分区标题均在', () => {
    const wrapper = mount(PanelHost)

    const labels = wrapper.findAll('.setting-label').map((w) => w.text())
    // 分区① AI 连接
    expect(labels).toContain(t('settings.aiConnection'))
    expect(labels).toContain(t('settings.aiBaseURL'))
    expect(labels).toContain(t('settings.aiTimeout'))
    // 分区② 快捷键
    expect(labels).toContain(t('settings.aiShortcuts'))
    // 分区③ 发散方向
    expect(labels).toContain(t('settings.aiDirections'))
    // 全程无运行时错误
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('分区②：本插件登记动作渲染为 ShortcutActionRow 改键行（label 来自登记 def）', () => {
    const wrapper = mount(PanelHost)
    // 登记的「直接生成」动作 → 改键行（键帽）渲染，label 成品文案出现
    const kbd = wrapper.findAll('.shortcut-kbd').map((w) => w.text())
    expect(kbd.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain(t('shortcuts.actionAIGenerate'))
  })

  it('分区③：默认方向与方向列表渲染（AIDirectionsSection 原样复用）', () => {
    const wrapper = mount(PanelHost)
    expect(wrapper.text()).toContain(t('settings.aiDirectionDefault'))
    expect(wrapper.text()).toContain(t('settings.directionAdd'))
  })

  it('分区① 连接参数仍直绑 aiConfig：输入写回 store（一栏目三分区不改变数据链路）', async () => {
    const wrapper = mount(PanelHost)
    const aiConfig = useAIConfigStore()
    const input = wrapper
      .findAll('input')
      .find((i) => (i.element as HTMLInputElement).value === AI_DEFAULT_CONFIG.baseURL)!
    await input.setValue('http://10.0.0.5:11434/v1')
    expect(aiConfig.baseURL).toBe('http://10.0.0.5:11434/v1')
  })
})
