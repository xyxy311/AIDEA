import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { adapter } from '@/plugin/adapter'

describe('scope.config（插件配置 api）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('get/set/remove：经 adapter.for 可达，未知键回退 fallback', () => {
    const config = adapter.for('cfgtest').config
    expect(config.get('k', '默认')).toBe('默认')
    config.set('k', { n: 1 })
    expect(config.get('k', '默认')).toEqual({ n: 1 })
    config.remove('k')
    expect(config.get('k', '默认')).toBe('默认')
    // remove 不存在的键为 no-op
    expect(() => config.remove('missing')).not.toThrow()
  })

  it('命名空间隔离：hello 与 other 互不可见，各落独立文件', async () => {
    adapter.for('hello').config.set('k', 'v1')
    adapter.for('other').config.set('k', 'v2')
    expect(adapter.for('hello').config.get('k', '')).toBe('v1')
    expect(adapter.for('other').config.get('k', '')).toBe('v2')
    await nextTick()
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.hello')!).data).toEqual({ k: 'v1' })
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.other')!).data).toEqual({ k: 'v2' })
  })

  it('即改即写：set 后落盘为完整 PluginConfigFile 结构', async () => {
    adapter.for('x').config.set('k', 1)
    await nextTick()
    expect(JSON.parse(localStorage.getItem('aidea-plugin-config.x')!)).toEqual({
      version: 1,
      data: { k: 1 },
      shortcuts: {},
    })
  })

  it('只读不建文件；首次写入自动建文件', async () => {
    adapter.for('ro').config.get('k', null)
    expect(localStorage.getItem('aidea-plugin-config.ro')).toBeNull()
    adapter.for('rw').config.set('k', 1)
    await nextTick()
    expect(localStorage.getItem('aidea-plugin-config.rw')).not.toBeNull()
  })
})
