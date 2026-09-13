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
 *
 * 词列表滚动刻意用原生滚动（不用 NScrollbar）：浮窗内容高度是 auto（收缩适应），
 * NScrollbar 内部 container 靠 height:100% 百分比链取高，在「auto + max-height 钳制」
 * 场景下百分比解析失败，溢出内容被其根 overflow:hidden 静默裁剪、无法滚动（词列表
 * 在上限处截断的根因）；原生滚动把 max-height 与 overflow-y 放在同一元素上，
 * 自包含可靠，无此依赖。
 */
import { NButton } from 'naive-ui'
import { useAIWordPanel } from '../composables/useAIWordPanel'
import { useAIWordAdd } from '../composables/useAIWordAdd'
import { t } from '../i18n' // 插件自有语言包（aiWord.* 等插件命名空间 key，见 ../i18n.ts 分流说明）

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
      <!-- 词列表：滚动容器即列表本体（原生滚动，见样式区说明） -->
      <ul v-else class="ai-word__list">
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

      <!-- 底部操作区 -->
      <div class="ai-word__actions">
        <NButton size="small" type="primary" @click="addAll(words)">{{ t('aiWord.addAll') }}</NButton>
        <NButton size="small" @click="close">{{ t('aiWord.close') }}</NButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 根元素只做内容纵向布局；宽度 / 外观容器样式归宿主窗口。
   收缩链：壳 body 为 flex column 且高度受壳 max-height 约束——本容器作为其
   flex 子项须允许收缩（min-height: 0），max-height: 100% 兜住父高度，
   词多时把滚动交给词列表本体（原生滚动）而不是撑爆窗口 */
.ai-word {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  max-height: 100%;
}

/* 错误 / 空态：上限与词列表一致——长错误信息（如 API 大段报错）内部滚动，
   防止把面板无限撑高（空态矮内容不受影响） */
.ai-word__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
  max-height: 260px;
  overflow-y: auto;
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

/* 词列表 = 滚动容器本体：max-height 与 overflow-y 在持有内容的同一元素上，
   是 CSS 规范保证的自包含滚动行为（无百分比高度链、无 JS 测量依赖），不可能截断。
   ——刻意不用 NScrollbar：其内部 container 靠 height:100% 百分比链取高，在
   「auto 高度 + max-height 钳制」（浮窗内容收缩场景）下百分比解析失败，
   溢出内容被根 overflow:hidden 静默裁剪、无法滚动（前两轮修复的截断根因）。
   flex 收缩链适配壳层小视口；max-height 260px 是无约束场景的上限
   （词少时列表高度=内容高度，不会被拉伸出空白） */
.ai-word__list {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 260px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Firefox：细滚动条，thumb 用中性色 */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

/* Chrome / Safari / Edge：6px 细滚动条（圆角胶囊形，hover 加深一档） */
.ai-word__list::-webkit-scrollbar {
  width: 6px;
}

.ai-word__list::-webkit-scrollbar-track {
  background: transparent;
}

.ai-word__list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.ai-word__list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
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
  /* 操作区（含「关闭」）永不压缩——极端小视口下收缩空间全部让给滚动区 */
  flex-shrink: 0;
}
</style>
