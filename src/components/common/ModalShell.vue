<script setup lang="ts">
/**
 * ModalShell — 模态公共外壳：统一 NModal + NCard 外观与关闭行为。
 * 关闭一律经 emit('close') 上抛，开关状态由外部 :show 驱动（单一数据源）；
 * Esc/遮罩/标题栏关闭均由 closable 控制。内部承载 default 内容与可选 footer。
 */
import { computed } from 'vue'
import { NModal, NCard } from 'naive-ui'

const props = withDefaults(
  defineProps<{
    show: boolean
    /** 标题栏文本（经 t() 由调用方传入） */
    title?: string
    /** 弹窗宽度：数字按 px；数字字符串（如 '640'）自动补 px；其它字符串原样透传（如 '80%'） */
    width?: number | string
    /** 弹窗最大高度（如 '80vh'）。传入时卡片限高、内容区横向/纵向滚动，页脚/标题固定 */
    maxHeight?: string
    /** 是否允许关闭（同时控制遮罩点击关闭与标题栏关闭钮） */
    closable?: boolean
  }>(),
  {
    title: '',
    width: 560,
    closable: true,
  },
)

/** 归一化宽度为合法 CSS 值（数字 / 数字字符串 → px，其余透传） */
const cardWidth = computed(() => {
  const w = props.width
  if (typeof w === 'number') return `${w}px`
  if (/^\d+$/.test(w)) return `${w}px`
  return w
})

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="closable"
    @update:show="(v: boolean) => { if (!v) emit('close') }"
  >
    <NCard
      :title="title"
      :class="{ 'modal-shell--max': !!maxHeight }"
      :style="{
        width: cardWidth,
        // 永不超出视口：即使内容横向溢出也让卡片收窄，关闭钮始终可达
        maxWidth: 'calc(100vw - 40px)',
        ...(maxHeight ? { maxHeight } : {}),
      }"
      :closable="closable"
      @close="emit('close')"
    >
      <slot />
      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
/* 限高时：卡片为纵向 flex，内容区占满剩余空间并双向滚动，标题/页脚固定 */
.modal-shell--max {
  display: flex;
  flex-direction: column;
}
.modal-shell--max :deep(.n-card__content) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.modal-shell--max :deep(.n-card__header),
.modal-shell--max :deep(.n-card__footer) {
  flex-shrink: 0;
}
</style>
