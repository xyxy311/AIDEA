<script setup lang="ts">
/**
 * HelloSettingsPanel —— 示例插件「示例插件配置」设置栏目内容组件（无自带 header）。
 *
 * 演示：
 * - additions 项目化数据：展示当前 demo 值，并提供「清除示例数据」按钮（additions.remove，可撤销）。
 * - 布局沿用内置 Settings Section 的 .settings-controls/.setting-row 结构
 *   （import 相对路径的 settings-shared.css，与现有 Section 对齐）。
 * 注意：additions 作用域 api 经 `adapter.for('hello').additions` 获取（for 有模块级缓存，
 * 与入口 setup 拿到同一实例）；组件不得 import 插件入口（构成循环依赖），直接 for('hello')。
 */
import { ref, onMounted } from 'vue'
import { NButton } from 'naive-ui'
import { adapter } from '@/plugin/adapter'
import '../../src/components/settings/settings-shared.css'

const additions = adapter.for('hello').additions
const DEMO_KEY = 'demo'

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
  </div>
</template>