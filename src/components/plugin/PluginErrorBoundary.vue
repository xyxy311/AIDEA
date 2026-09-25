<script setup lang="ts">
/**
 * PluginErrorBoundary — 插件 UI 渲染错误边界：拦截渲染错误置占位并记日志，避免单个插件拖垮界面。
 */
import { ref, onErrorCaptured } from 'vue'
import { t } from '@/composables/useT'

defineProps<{
  /** 插件 id（归因展示用，可选） */
  pluginId?: string
  /** 插件条目名（占位提示用，可选） */
  name?: string
}>()

/** 是否发生渲染错误（true 时展示占位而非插槽内容） */
const error = ref(false)

/** 错误摘要（展示在占位内，截图即可排障，无需翻 console） */
const message = ref('')

/** 捕获渲染错误落 console 并置占位；返回 false 阻断错误向上冒泡。 */
function onCapture(err: unknown, _instance: unknown, info: string): boolean {
  message.value = err instanceof Error ? err.message : String(err)
  console.error(`[plugin] 组件渲染错误（${info}）`, err)
  error.value = true
  return false
}
onErrorCaptured(onCapture)

/** 「重试」复位错误标记并重挂子树（错误组件已卸载）。 */
function reset(): void {
  error.value = false
  message.value = ''
}
</script>

<template>
  <!-- 正常状态：渲染插件内容 -->
  <slot v-if="!error" />
  <!-- 出错状态：最小占位（附错误摘要，排障无需翻 console） -->
  <div v-else class="plugin-error-boundary">
    <span v-if="name" class="p-eb-name">{{ name }}</span>
    <p class="p-eb-text">{{ t('plugin.componentError') }}</p>
    <code v-if="message" class="p-eb-message">{{ message }}</code>
    <button type="button" class="p-eb-retry" @click="reset">
      {{ t('plugin.retry') }}
    </button>
  </div>
</template>

<style scoped>
.plugin-error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  min-height: 64px;
  color: var(--color-text-muted);
  text-align: center;
  user-select: none;
}

.p-eb-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.p-eb-text {
  margin: 0;
  font-size: 12px;
}

.p-eb-message {
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--color-bg-muted, transparent);
  color: var(--color-text-secondary);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
  user-select: text;
}

.p-eb-retry {
  padding: 2px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.p-eb-retry:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
</style>