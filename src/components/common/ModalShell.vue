<script setup lang="ts">
/**
 * ModalShell — 模态公共外壳：统一 NModal + NCard 外观与关闭行为。
 * 关闭一律经 emit('close') 上抛，开关状态由外部 :show 驱动（单一数据源）；
 * Esc/遮罩/标题栏关闭均由 closable 控制。内部承载 default 内容与可选 footer。
 */
import { NModal, NCard } from 'naive-ui'

withDefaults(
  defineProps<{
    show: boolean
    /** 标题栏文本（经 t() 由调用方传入） */
    title?: string
    /** 弹窗宽度（数字按 px，字符串原样透传，如 '80%'） */
    width?: number | string
    /** 是否允许关闭（同时控制遮罩点击关闭与标题栏关闭钮） */
    closable?: boolean
  }>(),
  {
    title: '',
    width: 560,
    closable: true,
  },
)

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
      :style="{ width: typeof width === 'number' ? `${width}px` : width }"
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
