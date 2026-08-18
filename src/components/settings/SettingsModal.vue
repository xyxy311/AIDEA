<script setup lang="ts">
/**
 * SettingsModal — 设置面板页面骨架
 *
 * 窗口式外观，不可拖拽移动。内部为经典「左分类导航 + 右内容」两栏结构：
 * - 左侧：竖向分类导航（数据驱动，见 categories 常量），可滚动
 * - 右侧：当前选中分类的具体设置内容（各分类抽离为独立 Section 组件），独立可滚动
 *
 * 新增设置分类：只需在 categories 数组追加一项，并在 sections 记录
 * 该分类对应的 Section 组件即可，右侧内容区自动切换。
 */
import { NModal, NCard, NIcon, NScrollbar } from 'naive-ui'
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import {
  BrushOutline,
  LayersOutline,
  CompassOutline,
} from '@vicons/ionicons5'
import AppearanceSection from '@/components/settings/AppearanceSection.vue'
import LayoutSection from '@/components/settings/LayoutSection.vue'
import AIDirectionsSection from '@/components/settings/AIDirectionsSection.vue'
import { t } from '@/composables/useT'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// ── 左侧分类导航（数据驱动） ──

/** 设置分类 id */
type SettingsCategoryId = 'appearance' | 'layout' | 'aiDirections'

/** 单个设置分类定义 */
interface CategoryDef {
  id: SettingsCategoryId
  /** i18n key（经 t() 读取显示文案） */
  titleKey: string
  /** 分类图标 */
  icon: Component
}

/** 当前选中分类 id（默认「外观」） */
const activeId = ref<SettingsCategoryId>('appearance')

/** 当前选中分类的分区描述 key */
const activeDescKey = computed(() => `settings.${activeId.value}Desc` as const)

/** 分类 id → 右侧 Section 组件映射 */
const sections: Record<SettingsCategoryId, Component> = {
  appearance: AppearanceSection,
  layout: LayoutSection,
  aiDirections: AIDirectionsSection,
}

/** 当前选中分类右侧内容组件 */
const activeSection = computed(() => sections[activeId.value])

/** 设置分类表：新增分类只需在数组追加一项并在 sections 补对应映射 */
const categories: CategoryDef[] = [
  { id: 'appearance', titleKey: 'settings.appearance', icon: BrushOutline },
  { id: 'layout', titleKey: 'settings.layout', icon: LayersOutline },
  { id: 'aiDirections', titleKey: 'settings.aiDirections', icon: CompassOutline },
]
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="true"
    @update:show="(v: boolean) => { if (!v) emit('close') }"
  >
    <NCard
      :title="t('settings.title')"
      style="width: 720px"
      closable
      @close="emit('close')"
    >
      <div class="settings-body">
        <!-- 左侧分类导航 -->
        <aside class="settings-sidebar">
          <NScrollbar class="settings-sidebar-scroll">
            <div class="settings-nav">
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="settings-nav-item"
                :class="{ active: activeId === cat.id }"
                @click="activeId = cat.id"
              >
                <NIcon :component="cat.icon" class="settings-nav-icon" />
                <span class="settings-nav-label">{{ t(cat.titleKey) }}</span>
              </button>
            </div>
          </NScrollbar>
        </aside>

        <!-- 右侧内容区 -->
        <div class="settings-content">
          <NScrollbar class="settings-content-scroll">
            <div class="settings-section">
              <h3 class="settings-section-title">{{ t(`settings.${activeId}`) }}</h3>
              <p class="settings-section-desc">{{ t(activeDescKey) }}</p>

              <component :is="activeSection" />
            </div>
          </NScrollbar>
        </div>
      </div>
    </NCard>
  </NModal>
</template>

<style scoped>
/* ── 整体两栏布局 ── */
.settings-body {
  display: flex;
  height: 520px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

/* ── 左侧分类导航 ── */
.settings-sidebar {
  width: 176px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-hover);
}

.settings-sidebar-scroll {
  height: 100%;
}

.settings-nav {
  padding: 8px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  margin-bottom: 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.settings-nav-item:hover {
  background-color: var(--color-hover);
  color: var(--color-text);
}

.settings-nav-item.active {
  background-color: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

/* 选中项的左侧强调条 */
.settings-nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background-color: var(--color-primary);
}

.settings-nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.settings-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

/* ── 右侧内容区 ── */
.settings-content {
  flex: 1;
  min-width: 0;
}

.settings-content-scroll {
  height: 100%;
}

.settings-section {
  padding: 20px 24px;
  max-width: 560px;
}

.settings-section-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.settings-section-desc {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>