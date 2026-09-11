import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AIConnectionSettings from '../components/AIConnectionSettings.vue'
import { useAIConfigStore } from '../stores/aiConfig'
import { AI_DEFAULT_CONFIG } from '../constants'
import { t } from '@/composables/useT'

/**
 * 「AI 连接」设置栏目挂载冒烟（参照 src/__tests__/plugin/modal-smoke.test.ts 风格）：
 * 真实 pinia（aiConfig → pluginConfig → localStorage 真实链路）+ 挂载，
 * 断言连接参数行 / 快捷键区 / 恢复默认按钮渲染、默认值绑定与编辑即时写回。
 */
describe('AIConnectionSettings（AI 连接设置栏目）挂载冒烟', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    errorSpy.mockClear()
  })

  it('挂载渲染连接参数行 / 快捷键区 / 恢复默认按钮，无运行时错误', () => {
    const wrapper = mount(AIConnectionSettings)

    const labels = wrapper.findAll('.setting-label').map((w) => w.text())
    // 连接参数五行
    expect(labels).toContain(t('settings.aiConnection'))
    expect(labels).toContain(t('settings.aiBaseURL'))
    expect(labels).toContain(t('settings.aiModel'))
    expect(labels).toContain(t('settings.aiApiKey'))
    expect(labels).toContain(t('settings.aiTimeout'))
    expect(labels).toContain(t('settings.aiTemperature'))
    // 快捷键改键区
    expect(labels).toContain(t('settings.aiShortcuts'))
    // 恢复默认按钮
    const buttonTexts = wrapper.findAll('button').map((w) => w.text())
    expect(buttonTexts.join('\n')).toContain(t('settings.aiConnectionReset'))
    // 全程无运行时错误
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('baseURL 输入框渲染默认 Ollama 端点（来自 AI_DEFAULT_CONFIG 经 store）', () => {
    const wrapper = mount(AIConnectionSettings)
    const input = wrapper
      .findAll('input')
      .find((i) => (i.element as HTMLInputElement).value === AI_DEFAULT_CONFIG.baseURL)
    expect(input).toBeDefined()
  })

  it('编辑连接参数即时写回 store（直绑无本地镜像）', async () => {
    const wrapper = mount(AIConnectionSettings)
    const aiConfig = useAIConfigStore()
    // 找到 baseURL 输入框（渲染值为默认端点的那个），模拟用户输入
    const input = wrapper
      .findAll('input')
      .find((i) => (i.element as HTMLInputElement).value === AI_DEFAULT_CONFIG.baseURL)!
    await input.setValue('http://192.168.1.10:11434/v1')
    expect(aiConfig.baseURL).toBe('http://192.168.1.10:11434/v1')
  })

  it('恢复默认连接配置：改字段后点击按钮回默认', async () => {
    const wrapper = mount(AIConnectionSettings)
    const aiConfig = useAIConfigStore()
    aiConfig.model = 'custom-model'
    aiConfig.temperature = 0.2

    const resetBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === t('settings.aiConnectionReset'))!
    await resetBtn.trigger('click')

    expect(aiConfig.model).toBe(AI_DEFAULT_CONFIG.model)
    expect(aiConfig.temperature).toBe(AI_DEFAULT_CONFIG.temperature)
  })
})
