<script setup lang="ts">
/**
 * WheelScroll - 通用「滚轮横向滚动」容器
 *
 * 顶部图标条左/中/右三个分区共用的横向滚动方案：
 * - 内容超出容器宽度时可横向滚动，未超出时各分区表现为等宽排列，无任何副作用
 * - 鼠标滚轮（含 shift+滚轮触发的横向 delta）驱动横向滚动，纵向滚动被消费，不会带动页面滚动
 * - 三端统一隐藏滚动条，仅保留滚轮滚动（Firefox `scrollbar-width` / WebKit `-webkit-scrollbar` / Edge `-ms-overflow-style`）
 * - 声明式用法：默认插槽放入实际内容；宽/高由外层 flex 布局接管
 */
import { ref } from 'vue'

/** 滚动容器根元素 */
const el = ref<HTMLElement | null>(null)

/** 滚轮事件 → 横向位移：取 deltaX/deltaY 中绝对值更大的一向作为滚动量 */
function onWheel(e: WheelEvent): void {
  const target = el.value
  if (!target) return
  // 三区统一消费滚轮，避免纵向滚动冒泡带动页面
  e.preventDefault()
  const amount = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  target.scrollLeft += amount
}
</script>

<template>
  <div ref="el" class="wheel-scroll" @wheel="onWheel">
    <slot />
  </div>
</template>

<style scoped>
.wheel-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  /* 三端统一隐藏滚动条，只用滚轮横向滚动 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* Edge / IE */
}

.wheel-scroll::-webkit-scrollbar {
  display: none; /* Chrome / Safari */
  width: 0;
  height: 0;
}
</style>