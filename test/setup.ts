/**
 * test/setup.ts —— vitest 全局测试桩（setupFiles，每个测试文件运行前执行一次）
 *
 * 项目已收敛为纯 Electron 桌面形态：`desktop.ts` / `useWindowControls.ts` /
 * `useNativeFile.ts` 在**模块加载时**读取 preload 注入的 window.aideaDesktop /
 * aideaWindow / aideaFile 桥（架构红线：恒存在）。测试环境（happy-dom）没有
 * preload，因此统一在此预置良性默认桩，保证任何经桌面桥的模块加载即有桥可用
 * （模拟真实壳层）。
 *
 * - listPlugins 默认返回空数组（空插件集 → installAll 空转，多数用例的天然起点）；
 * - onPluginsChanged 返回 no-op 退订函数；
 * - aideaWindow 各方法 no-op，isMaximized 恒 false；
 * - aideaFile：open/save 默认取消，write/read 抛错（避免意外改动测试环境文件）；
 * - aideaI18n：list/read 抛错、onChanged no-op（默认无运行时语言，避免误登记测试环境文件）。
 *
 * 需要特定桥行为的用例自行覆盖：先 `(window as any).aideaXxx = <定制桩>`，
 * 再 `vi.resetModules()` + 动态 import 被测模块（与 sources.test.ts 同款装置）。
 *
 * ⚠ 仅在存在 window 的环境（happy-dom / renderer 侧测试）注入；electron 侧单测
 * （main/preload）在 node 环境无 window，整段跳过以免 ReferenceError。
 */
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'aideaDesktop', {
    value: {
      kind: 'desktop',
      // 默认空插件集：不产生真实动态 import / 插件 setup
      listPlugins: async () => [],
      onPluginsChanged: () => () => {},
    },
    configurable: true,
    writable: true,
  })

  Object.defineProperty(window, 'aideaWindow', {
    value: {
      minimize: () => {},
      toggleMaximize: () => {},
      close: () => {},
      isMaximized: async () => false,
      onMaximizedChange: () => () => {},
    },
    configurable: true,
    writable: true,
  })

  Object.defineProperty(window, 'aideaFile', {
    value: {
      // 默认实现：打开/另存即取消（不进磁盘读写），写读抛错（避免意外改动测试环境文件）。
      // 需要具体行为的用例自行覆写为定制桩。
      openProject: async () => ({ canceled: true }),
      saveProject: async () => ({ canceled: true }),
      writeFile: async () => {
        throw new Error('test setup: aideaFile.writeFile 未配置具体 stub')
      },
      readFile: async () => {
        throw new Error('test setup: aideaFile.readFile 未配置具体 stub')
      },
    },
    configurable: true,
    writable: true,
  })

  Object.defineProperty(window, 'aideaI18n', {
    value: {
      // 默认空语言集：list 空、read 抛错（避免读到真实 i18n-runtime 文件、误登记测试环境）。
      // 需要具体桥行为的用例自行覆写（见 sources.test.ts 同款装置：vi.resetModules + 动态 import）。
      list: async () => [],
      read: async () => {
        throw new Error('test setup: aideaI18n.read 未配置具体 stub')
      },
      onChanged: () => () => {},
    },
    configurable: true,
    writable: true,
  })
}