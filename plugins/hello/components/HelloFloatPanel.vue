<script setup lang="ts">
/**
 * HelloFloatPanel — 示例插件浮动面板（纯内容组件，FloatingWindow + SDK 浮动层 API 测试载体）
 *
 * 演示「插件注册只填内容、窗口壳归宿主」的浮动层约定：
 * - 窗口 chrome（定位 / 拖拽把手条 / 转场 / 越界钳制 / Teleport）由通用件
 *   FloatingWindow（src/components/common/）提供，本组件不感知自身窗口容器；
 * - 显隐归插件浮动运行时 API：本组件只演示**关闭由插件负责**（宿主窗口不放关闭按钮，
 *   关闭入口由内容自备）——「关闭」按钮调 adapter.for(HELLO_PLUGIN_ID).floating.close；
 * - 打开 / 切换入口在插件入口 index.ts（快捷键 H toggle）。
 * 插件 id / 浮动层短 id 取 constants.ts 常量，不硬编码散落（也不得 import 入口 index.ts）。
 */
import { NButton } from 'naive-ui'
import { adapter } from '@/plugin/adapter'
import { t } from '@/composables/useT'
import { HELLO_PLUGIN_ID, HELLO_FLOAT_LAYER_ID } from '../constants'

/** 关闭浮动面板（关闭由插件负责——宿主 FloatingWindow 窗口壳不放关闭按钮） */
function close(): void {
  adapter.for(HELLO_PLUGIN_ID).floating.close(HELLO_FLOAT_LAYER_ID)
}
</script>

<template>
  <!-- 纯内容容器：窗口外观（宽度/边框/圆角/阴影/定位/拖动）由宿主 FloatingWindow 提供 -->
  <div class="hello-float">
    <div class="hello-float__title">{{ t('hello.floatTitle') }}</div>
    <p class="hello-float__desc">{{ t('hello.floatDesc') }}</p>
    <p class="hello-float__hint">{{ t('hello.floatHint') }}</p>
    <div class="hello-float__actions">
      <NButton size="small" @click="close">
        {{ t('hello.floatClose') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.hello-float__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.hello-float__desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.hello-float__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.hello-float__actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>
