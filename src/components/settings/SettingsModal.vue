<script setup lang="ts">
/**
 * SettingsModal — 设置面板页面骨架
 *
 * 窗口式外观，不可拖拽移动。内部为经典「左分类导航 + 右内容」两栏结构：
 * - 左侧：竖向分类导航（数据驱动，见 categories 表，来源 uiRegistry 登记总表），可滚动
 * - 右侧：当前选中分类的具体设置内容（各分类抽离为独立 Section 组件），独立可滚动
 *
 * 数据源：uiRegistry store 的 settingsCategories 登记总表（内置已 seed，顺序 =
 * 品类表顺序；插件注册进同一张表并追加其后）。新增设置分类只需在
 * constants/settings.ts 登记 + 提供对应 Section 组件即可，导航 / 内容自动生效。
 */
import { NIcon, NScrollbar } from 'naive-ui'
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import ModalShell from '@/components/common/ModalShell.vue'
import PluginErrorBoundary from '@/components/plugin/PluginErrorBoundary.vue'
import { useUiRegistryStore, type UiSettingsEntry } from '@/stores/uiRegistry'
import { t } from '@/composables/useT'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// ── 左侧分类导航（数据驱动） ──

const registry = useUiRegistryStore()

/** 全部设置分类（内置 + 插件；builtin 序 = 品类表顺序，插件追加其后） */
const categories = computed<UiSettingsEntry[]>(() => [...registry.settingsCategories.values()])

/** 第一个插件分类所在索引（其前渲染分隔线；无插件返回 -1） */
const firstPluginIndex = computed(() =>
  categories.value.findIndex((e) => e.origin === 'plugin'),
)

/** 当前选中分类 id（插件栏目 id 为 `${pluginId}:${id}` 字符串，放宽为 string） */
const activeId = ref<string>('appearance')

/** 当前选中分类的登记条目（不存在时为 undefined） */
const activeEntry = computed<UiSettingsEntry | undefined>(() =>
  registry.settingsCategories.get(activeId.value),
)

/** 是否为内置分类（等价判断：登记来源为 builtin） */
const isBuiltinTab = (entry?: UiSettingsEntry): boolean => entry?.origin === 'builtin'

/** 当前选中分类右侧内容组件；插件经目录动态解析，未知 id 返回 null */
const activeSection = computed<Component | null>(() => activeEntry.value?.component ?? null)

/** 当前选中分类标题：内置用 titleKey i18n；插件用纯字符串 title（缺省回退 key） */
const activeTitle = computed(() => {
  const entry = activeEntry.value
  if (!entry) return ''
  return isBuiltinTab(entry) ? t(entry.titleKey!) : (entry.title ?? entry.key)
})

/** 当前选中分类的分区描述（仅内置有 descKey；插件无描述则不显示） */
const activeDesc = computed<string | null>(() =>
  activeEntry.value?.descKey ? t(activeEntry.value.descKey) : null,
)
</script>

<template>
  <!-- 模态外壳统一走 ModalShell（遮罩/Esc/标题栏关闭行为一致）；对外接口不变 -->
  <ModalShell
    :show="show"
    :title="t('settings.title')"
    :width="720"
    @close="emit('close')"
  >
    <div class="settings-body">
      <!-- 左侧分类导航 -->
      <aside class="settings-sidebar">
        <NScrollbar class="settings-sidebar-scroll">
          <div class="settings-nav">
            <!-- 全部分类（内置 + 插件）：以循环索引判断在第一个插件条目前渲染分隔线 -->
            <template v-for="(entry, i) in categories" :key="entry.key">
              <div v-if="i === firstPluginIndex" class="settings-nav-divider" />
              <button
                type="button"
                class="settings-nav-item"
                :class="{ active: activeId === entry.key }"
                @click="activeId = entry.key"
              >
                <NIcon v-if="entry.icon" :component="entry.icon" class="settings-nav-icon" />
                <span
                  class="settings-nav-label"
                  :class="{ 'plugin-nav-label': entry.origin === 'plugin' }"
                >{{ entry.origin === 'builtin' ? t(entry.titleKey!) : (entry.title ?? entry.key) }}</span>
              </button>
            </template>
          </div>
        </NScrollbar>
      </aside>

      <!-- 右侧内容区 -->
      <div class="settings-content">
        <NScrollbar class="settings-content-scroll">
          <div class="settings-section">
            <h3 class="settings-section-title">{{ activeTitle }}</h3>
            <p v-if="activeDesc" class="settings-section-desc">{{ activeDesc }}</p>

            <!-- 插件设置栏目外包错误边界，渲染异常隔离到占位 -->
            <PluginErrorBoundary
              v-if="activeEntry?.pluginId"
              :plugin-id="activeEntry.pluginId"
              :name="activeEntry.title ?? activeEntry.key"
            >
              <component :is="activeSection" />
            </PluginErrorBoundary>
            <component v-else :is="activeSection" />
          </div>
        </NScrollbar>
      </div>
    </div>
  </ModalShell>
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

/* 内置组与插件组之间的分隔线 */
.settings-nav-divider {
  height: 1px;
  margin: 8px 6px;
  background: var(--color-border);
}

/* 插件分类无图标，标签左padding补齐与带图标项的视觉对齐 */
.plugin-nav-label {
  margin-left: 26px;
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