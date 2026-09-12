<script setup lang="ts">
/**
 * FloatingAIWordPanel — AI 生成词浮动面板（纯内容组件）
 *
 * 经插件浮动层注册渲染：窗口壳（定位 / 拖动 / 把手条标题 / 转场 / Teleport）
 * 全部由通用窗口壳 FloatingWindow（components/common）提供，显隐经插件浮动运行时 API（scope.floating，
 * 短 id 'words'）由 useAIWordPanel 控制——本组件不感知自身窗口容器，也不持有显隐状态。
 * 内容（words/error）由 useAIWordPanel 共享单例提供，无加载态；
 * 生成由 AIPanel / 键盘快捷键完成，完成后 floating.open('words') 展示。
 *
 * 内容结构：错误 / 空态 / 词列表（整行可点击：点击即把该词添加为当前视图的节点）+
 * 底部操作区「全部添加」「关闭」（关闭入口由插件内容自备，宿主窗口不放关闭按钮）。
 *
 * 添加节点换算：视口中心屏幕坐标 → 世界坐标（world = (screen - offset) / scale），
 * 经 adapter.api.node.create 创建并入历史栈；批量操作用
 * adapter.api.project.beginBatch/commitBatch 合并为单条历史。
 * 添加逻辑已抽取到 useAIWordAdd，此处直接复用。
 */
import { NScrollbar, NButton } from 'naive-ui'
import { useAIWordPanel } from '../composables/useAIWordPanel'
import { useAIWordAdd } from '../composables/useAIWordAdd'
import { t } from '@/composables/useT'

const { error, words, close } = useAIWordPanel()
const { addWord, addAll } = useAIWordAdd()
</script>

<template>
  <!-- 纯内容容器：窗口外观（宽度/边框/圆角/阴影/定位）由通用窗口壳 FloatingWindow 提供 -->
  <div class="ai-word">
    <!-- 错误 -->
    <div v-if="error" class="ai-word__state">
      <span class="ai-word__error">{{ t('aiWord.error', { message: error }) }}</span>
    </div>

    <!-- 成功 -->
    <template v-else>
      <div v-if="words.length === 0" class="ai-word__state">
        <span class="ai-word__hint">{{ t('aiWord.empty') }}</span>
      </div>
      <NScrollbar v-else class="ai-word__scroll">
        <ul class="ai-word__list">
          <li
            v-for="(word, idx) in words"
            :key="idx"
            class="ai-word__item"
            @click="addWord(word)"
          >
            <span class="ai-word__word">{{ word }}</span>
            <button
              class="ai-word__add"
              :title="t('aiWord.add')"
              @click.stop="addWord(word)"
            >
              ＋
            </button>
          </li>
        </ul>
      </NScrollbar>

      <!-- 底部操作区 -->
      <div class="ai-word__actions">
        <NButton size="small" type="primary" @click="addAll(words)">{{ t('aiWord.addAll') }}</NButton>
        <NButton size="small" @click="close">{{ t('aiWord.close') }}</NButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 根元素只做内容纵向布局；宽度 / 外观容器样式归宿主窗口 */
.ai-word {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-word__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
}

.ai-word__hint {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.ai-word__error {
  font-size: 13px;
  color: var(--color-danger);
  text-align: center;
  word-break: break-all;
}

.ai-word__scroll {
  max-height: 260px;
}

.ai-word__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-word__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.ai-word__item:hover {
  background-color: var(--color-primary-soft);
}

.ai-word__word {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-word__add {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
}

.ai-word__add:hover {
  color: var(--color-primary-pressed);
}

.ai-word__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
}
</style>
