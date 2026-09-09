/**
 * 插件模态面板注册类型定义
 *
 * 模态面板是「登记进 uiRegistry 但不走 dock/活动栏布局派生」的 UI 元素：
 * 插件经 ctx.register.registerModal 登记描述符（key = `${pluginId}:${id}`），
 * 主程序的模态外壳按登记渲染。本文件只定义登记描述，
 * 不含打开/关闭运行时（运行时 API 后续提供）。
 */
import type { Component } from 'vue'

/** 插件模态面板注册描述 */
export interface ModalRegistration {
  /** 短 id（不含插件前缀）；完整 key 为 `${pluginId}:${id}` */
  id: string
  /** 标题（插件传字符串） */
  title: string
  /** 纯内容组件：外壳（ModalShell）负责标题栏/遮罩/Esc，组件自身不渲染 NModal */
  component: Component
  /** 内容区宽度（px），可选 */
  width?: number
}
