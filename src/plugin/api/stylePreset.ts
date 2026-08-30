/**
 * api/stylePreset.ts —— 预设域：增删改（预留）
 * 应用预设见 node.applyPreset / connection.applyPreset。待 presets 数据层落地后，
 * 在此定义 list / add / update / remove（类型仍由实现派生）。
 */
export function createStylePresetApi() {
  return {}
}

export type StylePresetApi = ReturnType<typeof createStylePresetApi>