<script setup lang="ts">
/**
 * McpSection — 设置面板「Agent MCP」分区：
 * 总开关 / 端口 / token（查看·复制·重置）/ 客户端配置片段 / 运行状态 / 工具清单 / 调用日志。
 * 经 src/mcp/host.ts 的安全封装访问 aideaMcp 桥（非桌面形态各项优雅降级为不可用提示）。
 */
import { NButton, NSwitch, NInput, NInputNumber, NTag, useMessage } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'
import { TOOLS } from '@/mcp/registry'
import {
  getMcpConfigSafe,
  getMcpStatusSafe,
  onMcpStatus,
  setMcpConfigSafe,
  subscribeMcpLogs,
  type McpCallLogEntry,
} from '@/mcp/host'
import type { McpConfig, McpStatus } from '../../../electron/shared/bridge'

const message = useMessage()

const config = ref<McpConfig | null>(null)
const status = ref<McpStatus | null>(null)
const logs = ref<McpCallLogEntry[]>([])
const tokenVisible = ref(false)
/** 工具清单/日志折叠态 */
const showTools = ref(false)
const showLogs = ref(false)

let unsubStatus: () => void = () => {}
let unsubLogs: () => void = () => {}
/** 是否已收到状态推送（避免快照覆盖更新的推送） */
let pushReceived = false

onMounted(async () => {
  // 先订阅推送，再补拉一次快照：初始化/重开面板时错过的广播由此补上
  unsubStatus = onMcpStatus((s) => {
    pushReceived = true
    status.value = s
  })
  unsubLogs = subscribeMcpLogs((entries) => {
    logs.value = entries
  })
  const [configSnapshot, statusSnapshot] = await Promise.all([getMcpConfigSafe(), getMcpStatusSafe()])
  config.value = configSnapshot
  if (!pushReceived && statusSnapshot) status.value = statusSnapshot
})
onUnmounted(() => {
  unsubStatus()
  unsubLogs()
})

/** MCP 桥不可用（非桌面形态/测试环境） */
const unavailable = computed(() => config.value === null)

const runningText = computed(() => {
  const s = status.value
  if (!s) return t('mcp.statusUnknown')
  if (!s.enabled) return t('mcp.statusDisabled')
  if (s.running) return t('mcp.statusRunning', { port: String(s.port) })
  return s.error ? t('mcp.statusError', { error: s.error }) : t('mcp.statusDisabled')
})

const clientSnippet = computed(() => {
  const port = config.value?.port ?? 9876
  return JSON.stringify(
    {
      mcpServers: {
        aidea: {
          url: `http://127.0.0.1:${port}/mcp`,
          headers: { Authorization: `Bearer ${config.value?.token ?? '<token>'}` },
        },
      },
    },
    null,
    2,
  )
})

async function apply(patch: Parameters<typeof setMcpConfigSafe>[0]): Promise<void> {
  try {
    config.value = await setMcpConfigSafe(patch)
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  }
}

async function handleToggleEnabled(enabled: boolean): Promise<void> {
  await apply({ enabled })
}

async function handlePortChange(port: number | null): Promise<void> {
  if (port === null || port === config.value?.port) return
  await apply({ port })
}

async function handleResetToken(): Promise<void> {
  await apply({ regenerateToken: true })
  message.success(t('mcp.tokenResetDone'))
}

async function copyText(text: string, successKey: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t(successKey))
  } catch {
    message.error(t('mcp.copyFailed'))
  }
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}
</script>

<template>
  <div class="settings-controls">
    <div v-if="unavailable" class="setting-row">
      <div class="setting-cell">
        <div class="setting-label">{{ t('mcp.unavailable') }}</div>
        <div class="setting-desc">{{ t('mcp.unavailableHint') }}</div>
      </div>
    </div>

    <template v-else>
      <!-- 总开关 -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.enabled') }}</div>
          <div class="setting-desc">{{ t('mcp.enabledHint') }}</div>
        </div>
        <NSwitch :value="config!.enabled" @update:value="handleToggleEnabled" />
      </div>

      <!-- 运行状态 -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.status') }}</div>
          <div class="setting-desc">{{ runningText }}</div>
        </div>
        <NTag :type="status?.running ? 'success' : 'default'" size="small">
          {{ status?.running ? t('mcp.badgeRunning') : t('mcp.badgeStopped') }}
        </NTag>
      </div>

      <!-- 端口 -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.port') }}</div>
          <div class="setting-desc">{{ t('mcp.portHint') }}</div>
        </div>
        <NInputNumber
          :value="config!.port"
          size="small"
          :min="1024"
          :max="65535"
          :step="1"
          :show-button="false"
          class="mcp-port-input"
          @update:value="handlePortChange"
        />
      </div>

      <!-- token -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.token') }}</div>
          <div class="setting-desc">{{ t('mcp.tokenHint') }}</div>
        </div>
        <div class="mcp-token-actions">
          <NInput
            :value="config!.token"
            size="small"
            readonly
            :type="tokenVisible ? 'text' : 'password'"
            class="mcp-token-input"
            @click="tokenVisible = !tokenVisible"
          />
          <NButton size="small" @click="copyText(config!.token, 'mcp.tokenCopied')">
            {{ t('mcp.copy') }}
          </NButton>
          <NButton size="small" @click="handleResetToken">
            {{ t('mcp.resetToken') }}
          </NButton>
        </div>
      </div>

      <!-- 客户端配置片段 -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.clientConfig') }}</div>
          <div class="setting-desc">{{ t('mcp.clientConfigHint') }}</div>
        </div>
        <NButton size="small" @click="copyText(clientSnippet, 'mcp.clientConfigCopied')">
          {{ t('mcp.copy') }}
        </NButton>
      </div>
      <pre class="mcp-snippet">{{ clientSnippet }}</pre>

      <!-- 工具清单 -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.tools') }}</div>
          <div class="setting-desc">{{ t('mcp.toolsHint', { count: String(TOOLS.length) }) }}</div>
        </div>
        <NButton size="small" @click="showTools = !showTools">
          {{ showTools ? t('common.collapse') : t('common.expand') }}
        </NButton>
      </div>
      <ul v-if="showTools" class="mcp-tool-list">
        <li v-for="tool in TOOLS" :key="tool.name" class="mcp-tool-item">
          <NTag :type="tool.risk === 'danger' ? 'error' : tool.risk === 'write' ? 'warning' : 'info'" size="small">
            {{ t(`mcp.risk.${tool.risk}`) }}
          </NTag>
          <span class="mcp-tool-name">{{ tool.name }}</span>
          <span class="mcp-tool-title">{{ t(tool.title) }}</span>
        </li>
      </ul>

      <!-- 调用日志 -->
      <div class="setting-row">
        <div class="setting-cell">
          <div class="setting-label">{{ t('mcp.logs') }}</div>
          <div class="setting-desc">{{ t('mcp.logsHint', { count: String(logs.length) }) }}</div>
        </div>
        <NButton size="small" @click="showLogs = !showLogs">
          {{ showLogs ? t('common.collapse') : t('common.expand') }}
        </NButton>
      </div>
      <ul v-if="showLogs" class="mcp-log-list">
        <li v-for="(log, i) in logs" :key="`${log.time}-${i}`" class="mcp-log-item">
          <span class="mcp-log-time">{{ formatTime(log.time) }}</span>
          <span class="mcp-log-tool">{{ log.tool }}</span>
          <NTag :type="log.ok ? 'success' : 'error'" size="small">{{ log.ok ? 'OK' : 'ERR' }}</NTag>
          <span v-if="log.error" class="mcp-log-error">{{ log.error }}</span>
          <span class="mcp-log-duration">{{ log.durationMs }}ms</span>
        </li>
        <li v-if="logs.length === 0" class="mcp-log-item">{{ t('mcp.logsEmpty') }}</li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.mcp-port-input {
  width: 120px;
}
.mcp-token-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.mcp-token-input {
  width: 260px;
  font-family: monospace;
}
.mcp-snippet {
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-surface-muted, rgba(128, 128, 128, 0.1));
  font-size: 12px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow: auto;
}
.mcp-tool-list,
.mcp-log-list {
  margin: 4px 0 0;
  padding: 0 0 0 4px;
  list-style: none;
  max-height: 260px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mcp-tool-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.mcp-tool-name {
  font-family: monospace;
}
.mcp-tool-title {
  opacity: 0.7;
}
.mcp-log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}
.mcp-log-time,
.mcp-log-duration {
  opacity: 0.6;
  flex-shrink: 0;
}
.mcp-log-tool {
  font-family: monospace;
}
.mcp-log-error {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-danger, #e5484d);
}
</style>
