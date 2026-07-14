import type { CanvasPosition } from '@/types'

/**
 * 将节点位置限制在画布可视范围内
 * 节点中心点被限制在 [0, stageWidth] x [0, stageHeight] 区间，
 * 允许最多一半节点尺寸溢出画布边缘。
 *
 * @param x - 节点目标 x 坐标
 * @param y - 节点目标 y 坐标
 * @param stageWidth - 画布宽度
 * @param stageHeight - 画布高度
 * @param _nodeWidth - 节点宽度（保留参数，用于后续溢出比例计算）
 * @param _nodeHeight - 节点高度
 * @returns 限制后的 { x, y } 坐标
 */
export function clampPosition(
  x: number,
  y: number,
  stageWidth: number,
  stageHeight: number,
  _nodeWidth: number = 0,
  _nodeHeight: number = 0,
): CanvasPosition {
  return {
    x: Math.max(0, Math.min(x, stageWidth)),
    y: Math.max(0, Math.min(y, stageHeight)),
  }
}

/**
 * 估算文本渲染尺寸
 * 基于字符数和字体大小的近似计算
 *
 * @param text - 文本内容
 * @param fontSize - 字体大小（px）
 * @returns 估算的 { width, height }
 */
export function measureText(text: string, fontSize: number): { width: number; height: number } {
  if (!text || text.length === 0) {
    return { width: 0, height: fontSize * 1.5 }
  }

  // 中文字符约等于 fontSize 宽度，英文约为 fontSize * 0.6
  // 使用平均估算
  let width = 0
  for (const char of text) {
    // CJK 字符和全角标点
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
      width += fontSize
    } else {
      width += fontSize * 0.6
    }
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(fontSize * 1.5), // 行高 1.5
  }
}
