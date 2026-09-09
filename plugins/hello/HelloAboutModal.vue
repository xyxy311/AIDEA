<script setup lang="ts">
/**
 * HelloAboutModal —— 示例插件「关于」模态内容组件（纯内容，由宿主的 ModalShell 提供外壳）。
 *
 * 演示插件模态面板（ctx.register.registerModal 登记，完整 key `hello:about`）的最小内容形态：
 * 组件自身不渲染 NModal，只提供说明文字；标题栏 / 遮罩 / Esc / 关闭钮全部由模态宿主
 * （PluginModalHost → ModalShell）统一处理。文本为插件成品字符串（插件不接主 i18n，
 * 与注册面 title 惯例一致），样式用项目通用 token（var(--color-*)）。
 */
</script>

<template>
  <div class="hello-about">
    <p class="hello-about-text">
      这是示例插件 hello 的「关于」模态：经 <code>ctx.register.registerModal</code> 登记
      （完整 key <code>hello:about</code>），本组件只提供内容，标题栏与关闭行为由模态宿主统一提供。
    </p>
    <p class="hello-about-text">插件侧打开模态的入口（均收短 id，内部自动拼 <code>hello:</code> 前缀）：</p>
    <ul class="hello-about-list">
      <li>
        插件 setup 内：<code>ctx.modal.open('about')</code>
        ——见画布右键菜单「关于示例插件」。
      </li>
      <li>
        插件组件内：<code>adapter.for('hello').modal.open('about')</code>
        ——见「统计助手」面板的「关于本插件」按钮。
      </li>
    </ul>
    <p class="hello-about-hint">模态为全局单实例：同一时刻至多打开一个，Esc / 遮罩 / 关闭钮 / 程序化 close 均可关闭。</p>
  </div>
</template>

<style scoped>
.hello-about {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  color: var(--color-text);
}

.hello-about-text {
  margin: 0;
  line-height: 1.7;
}

.hello-about-list {
  margin: 0;
  padding-left: 20px;
  line-height: 1.8;
}

.hello-about-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-hover);
  font-size: 12px;
}
</style>
