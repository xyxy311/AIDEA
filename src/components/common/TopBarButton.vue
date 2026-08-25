<script lang="ts">
/**
 * TopBarButton - 通用顶部栏按钮模板（外壳）
 *
 * 顶部栏每个已注册按钮（LeftTopBar / RightTopBar）的视觉外壳，提供：
 * - 悬停 NTooltip 文字提示（与左侧活动栏同一视觉语言，title 已由调用方 t() 翻译）
 * - active 激活态（底部主色指示条，如网格开关）与 primary 主色变体（如「新建节点」）
 * - disabled 禁用态、variant 样式
 * - 「更多选项」下拉：menu 存在时渲染 split-button（主图标 + 独立小三角触发区），
 *   点击主区触发 @click，点小三角弹出 NDropdown
 *
 * 各按钮只提供 icon / title / disabled / active / variant / menu 与 @click，
 * 视觉细节全部由本模板统一（新增按钮无需重写样式）。
 */
import type { Component } from 'vue'
import type { DropdownOption } from 'naive-ui'

/** 下拉菜单单项（基于 Naive DropdownOption，追加 onSelect 回调，支持 children 子菜单） */
export type TopBarMenuOption = DropdownOption & { onSelect?: () => void }
</script>

<script setup lang="ts">
import { NDropdown, NTooltip } from 'naive-ui'

defineProps<{
  /** 图标组件（@vicons/ionicons5） */
  icon: Component
  /** hover 提示文案（已经过 t() 翻译） */
  title: string
  /** 禁用态 */
  disabled?: boolean
  /** 激活态高亮 */
  active?: boolean
  /** 样式变体：primary = 主色填充 */
  variant?: 'default' | 'primary'
  /** 「更多选项」下拉菜单（存在时渲染 split-button） */
  menu?: TopBarMenuOption[]
}>()

defineEmits<{
  /** 主操作点击 */
  click: []
}>()

/** 在菜单树中按 key 查找选项（含子菜单递归） */
function findOption(
  options: TopBarMenuOption[] | undefined,
  key: string | number,
): TopBarMenuOption | undefined {
  for (const o of options ?? []) {
    if (o.key === key) return o
    const found = findOption(o.children as TopBarMenuOption[] | undefined, key)
    if (found) return found
  }
  return undefined
}

/** 下拉菜单项选中：沿树找到对应选项并触发其 onSelect */
function handleMenuSelect(menu: TopBarMenuOption[] | undefined, key: string | number): void {
  findOption(menu, key)?.onSelect?.()
}
</script>

<template>
  <NTooltip placement="bottom" :disabled="!!menu">
    <template #trigger>
      <!-- 含下拉菜单：主图标（主操作）+ 独立小三角触发区（split button），
           两者为兄弟节点互不争抢点击，避免「一点既打开又弹菜单」 -->
      <div v-if="menu" class="top-btn-split">
        <button
          type="button"
          class="top-btn-main"
          :disabled="disabled"
          @click="$emit('click')"
        >
          <component :is="icon" class="top-btn-icon" />
        </button>
        <NDropdown
          :options="menu"
          trigger="click"
          @select="(key) => handleMenuSelect(menu, key)"
        >
          <span class="top-btn-caret" aria-hidden="true" />
        </NDropdown>
      </div>
      <button
        v-else
        type="button"
        class="top-btn"
        :class="{ active, primary: variant === 'primary' }"
        :disabled="disabled"
        @click="$emit('click')"
      >
        <component :is="icon" class="top-btn-icon" />
      </button>
    </template>
    {{ title }}
  </NTooltip>
</template>

<style scoped>
.top-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s, color 0.15s;
  position: relative;
  flex-shrink: 0;
}

/* 含下拉菜单的按钮：主图标占据主体，右下角为小三角触发区 */
.top-btn-split {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
}

.top-btn-main {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s;
}

.top-btn-split:hover .top-btn-main {
  opacity: 1;
  background: var(--color-hover);
}

.top-btn-main:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.top-btn-icon {
  width: 20px;
  height: 20px;
  pointer-events: none; /* 让点击穿透到按钮本体 */
}

/* “更多选项”小三角触发区：点击弹出下拉菜单 */
.top-btn-caret {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 13px;
  height: 13px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 1px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.top-btn-caret::before {
  content: '';
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--color-text);
  opacity: 0.8;
}

.top-btn-caret:hover {
  background: var(--color-hover);
}

/* 悬停：亮起 + 淡背景（与活动栏 hover 一致） */
.top-btn:hover:not(:disabled) {
  opacity: 1;
  background: var(--color-hover);
}

/* 禁用态：弱化 + 不响应 */
.top-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 激活态：底部主色指示条 + 高亮背景（用于网格开关等） */
.top-btn.active {
  opacity: 1;
  background: var(--color-active-bg);
  color: var(--color-text);
}

.top-btn.active::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 2px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

/* 主操作变体（新建节点）：主色填充醒目 */
.top-btn.primary {
  width: 40px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  opacity: 1;
}

.top-btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.top-btn.primary:active:not(:disabled) {
  background: var(--color-primary-pressed);
}

.top-btn.primary:disabled {
  opacity: 0.3;
}

.top-btn.primary.active::after {
  background: var(--color-on-primary);
}
</style>