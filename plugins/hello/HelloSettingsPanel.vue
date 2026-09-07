<script setup lang="ts">
/**
 * HelloSettingsPanel —— 示例插件「示例插件配置」设置栏目内容组件（无自带 header）。
 *
 * 演示：
 * - 插件自身配置：经 `adapter.for('hello').config`（get/set）读写问候语前缀
 *   （`aidea-plugin-config.hello` 独立存储，即时持久化、不入项目历史，改完即生效）。
 * - 快捷键动作改键 UI：经 `adapter.api.shortcuts.pluginActions('hello')`（computed 包裹
 *   保持响应，注册 / 回滚联动）动态渲染 SDK 导出的 ShortcutActionRow——
 *   录制改键 / 恢复默认 / 冲突提示在组件内闭环，插件动作的改键入口独占在插件自身设置栏目。
 * - additions 项目化数据：展示当前 demo 值，并提供「清除示例数据」按钮（additions.remove，可撤销）。
 * - 布局沿用内置 Settings Section 的 .settings-controls/.setting-row 结构
 *   （import 相对路径的 settings-shared.css，与现有 Section 对齐）。
 * 注意：组件不得 import 插件入口（会被入口 import，构成循环依赖）；additions / config
 * 作用域 api 经 `adapter.for('hello')` 获取（for 有模块级缓存，与入口 setup 拿到同一实例）。
 */
import { ref, computed, onMounted } from 'vue'
import { NButton, NInput } from 'naive-ui'
import { adapter, ShortcutActionRow } from '@/plugin/adapter'
import '../../src/components/settings/settings-shared.css'

const scope = adapter.for('hello')
const additions = scope.additions
const config = scope.config
const DEMO_KEY = 'demo'

/** 问候语前缀（greet 动作 console 输出的前缀；经 scope.config 持久化） */
const greetingPrefix = ref<string>(config.get('greetingPrefix', '你好'))

/** 改问候语前缀：即时写插件自身配置（下次触发 greet 即生效） */
function handlePrefixChange(value: string): void {
  greetingPrefix.value = value
  config.set('greetingPrefix', value)
}

/** 本插件登记的快捷键动作（key=完整登记 key，label=成品字符串）；computed 保持 uiRegistry 联动 */
const pluginActions = computed(() => adapter.api.shortcuts.pluginActions('hello'))

const demoValue = ref<string | null>(null)

function refreshDemo(): void {
  const v = additions.get(DEMO_KEY)
  demoValue.value = v === undefined || v === null ? null : JSON.stringify(v)
}

/** 清除示例数据（一次 remove = 单条历史，可撤销） */
function handleClear(): void {
  additions.remove(DEMO_KEY)
  refreshDemo()
}

onMounted(refreshDemo)
</script>

<template>
  <div class="settings-controls">
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">示例插件配置</div>
        <div class="setting-desc">
          此栏目演示插件注册的「设置栏目」。数据写入项目文件顶部 additions 字段，随项目保存、可撤销。
        </div>
      </div>
    </div>

    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">当前 additions demo 值</div>
        <div class="setting-desc">
          <span v-if="demoValue">{{ demoValue }}</span>
          <span v-else>（空）</span>
        </div>
      </div>
      <NButton size="small" @click="handleClear">清除示例数据</NButton>
    </div>

    <!-- 插件自身配置：问候语前缀（scope.config 即时持久化，改完即生效） -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">问候语前缀</div>
        <div class="setting-desc">快捷键触发问候时的前缀（存插件自身配置，即时生效，不随项目保存）。</div>
      </div>
      <NInput
        :value="greetingPrefix"
        size="small"
        placeholder="问候语前缀"
        @update:value="handlePrefixChange"
      />
    </div>

    <!-- 本插件注册的快捷键动作：点击键帽录制改键（主应用快捷键栏目不显示插件动作） -->
    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">快捷键动作</div>
        <div class="setting-desc">本插件注册的快捷键动作（点击键帽录制改键）。</div>
      </div>
    </div>
    <ShortcutActionRow
      v-for="row in pluginActions"
      :key="row.key"
      :action-key="row.key"
      :label="row.label"
    />
  </div>
</template>
