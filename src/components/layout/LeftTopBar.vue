<script setup lang="ts">
/**
 * LeftTopBar - 左顶部条（原 MenuBar 更名为）
 *
 * 顶部左侧图标栏，存放左向功能按钮（新建 / 打开 / 保存 / 撤销 / 重做 / 设置，从左到右）。
 * 按钮由品类表 constants/topbar.ts 注册，顺序与拖拽由通用容器 TopBarZone 承担，
 * 本组件只是固定 zone='left' 的薄封装。
 */
import TopBarZone from '@/components/common/TopBarZone.vue'
</script>

<template>
  <div class="left-top-bar">
    <TopBarZone zone="left" />
  </div>
</template>

<style scoped>
.left-top-bar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  flex-shrink: 0; /* 保持自然宽度：被 WheelScroll 包裹时超出可按滚轮横向滚动 */
}
</style>