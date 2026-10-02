<script setup lang="ts">
/**
 * TextInsertModal —— 「从文本插入」模态：直接在文本域输入，或经「导入文件」读取 txt 填入后二次编辑。
 * 确认后把原始文本 emit('insert') 给父级，由 useProjectFile.insertNodeText 解析并插入当前视图。
 */
import { nextTick, ref } from 'vue'
import { NInput, NButton, NSpace, NText } from 'naive-ui'
import ModalShell from '@/components/common/ModalShell.vue'
import { nativeFs } from '@/composables/useNativeFs'
import { t } from '@/composables/useT'

defineProps<{ show: boolean }>()

const emit = defineEmits<{
  close: []
  insert: [content: string]
}>()

const content = ref('')

/**
 * Tab 插入制表符：textarea 原生 Tab 会切换焦点，这里改为在光标处插入 \t（用于缩进层级）。
 * 经 input-props.onKeydown 绑定到内部 textarea；改值后需 nextTick 等 v-model 刷新完成再还原光标。
 */
function handleEditorKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const el = e.target as HTMLTextAreaElement
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? start
  content.value =
    content.value.slice(0, start) + '\t' + content.value.slice(end)
  void nextTick(() => {
    el.selectionStart = start + 1
    el.selectionEnd = start + 1
  })
}

/** 导入文件：经 fs 桥弹对话框读 txt，内容填入文本框供二次编辑 */
async function importFile(): Promise<void> {
  try {
    const res = await nativeFs.open({
      mode: 'text',
      title: t('menuBar.insertTextImportTitle'),
      filters: [{ name: t('menuBar.insertTextFilter'), extensions: ['txt'] }],
    })
    if (res.canceled || res.content === undefined) return
    content.value = res.content
  } catch {
    // 读取失败：保持模态打开、保留已输入内容，静默忽略（不入栈、不退场）
  }
}

function handleInsert(): void {
  emit('insert', content.value)
}
</script>

<template>
  <ModalShell
    :show="show"
    :title="t('menuBar.insertText')"
    :closable="true"
    :width="640"
    max-height="min(80vh, 600px)"
    @close="emit('close')"
  >
    <div class="insert-modal">
      <NText depth="3" class="insert-tip">{{ t('menuBar.insertTextTip') }}</NText>
      <!-- 固定高度分文本域：内容超长时内部横/纵双向滚动（wrap=off 关闭自动换行以支持横向） -->
      <NInput
        v-model:value="content"
        type="textarea"
        :input-props="{ wrap: 'off', rows: 12, onKeydown: handleEditorKeydown }"
        class="insert-editor"
        :placeholder="t('menuBar.insertTextPlaceholder')"
        spellcheck="false"
      />
    </div>
    <template #footer>
      <NSpace justify="space-between" align="center" style="width: 100%">
        <NButton text :loading="false" @click="importFile">
          {{ t('menuBar.insertTextImport') }}
        </NButton>
        <NSpace>
          <NButton @click="emit('close')">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="handleInsert">
            {{ t('menuBar.insertTextConfirm') }}
          </NButton>
        </NSpace>
      </NSpace>
    </template>
  </ModalShell>
</template>

<style scoped>
.insert-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.insert-tip {
  font-size: 13px;
  flex-shrink: 0;
}
/* 文本域：占满剩余高度，双向滚动由内部 textarea 与模态内容区共同接管 */
.insert-editor {
  flex: 1 1 auto;
  min-height: 0;
}
.insert-editor :deep(.n-input__textarea-el) {
  overflow: auto;
}
</style>