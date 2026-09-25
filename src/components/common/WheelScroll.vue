<script setup lang="ts">
/**
 * WheelScroll - 通用「滚轮横向滚动」容器：内容超出时可横向滚动，未超出时等宽排列无副作用。
 * 滚轮（含 shift+滚轮横向 delta）驱动 scrollLeft，纵向滚动被消费不带动页面；
 * 三端统一隐藏滚动条，宽/高由外层 flex 布局接管。
 */
import { ref } from 'vue'

/** 滚动容器根元素 */
const el = ref<HTMLElement | null>(null)

/** 滚轮 → 横向位移：取 deltaX/deltaY 中绝对值更大的一向作为滚动量 */
function onWheel(e: WheelEvent): void {
  const target = el.value
  if (!target) return
  e.preventDefault() // 消费滚轮，避免纵向滚动冒泡带动页面
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