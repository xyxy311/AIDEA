#!/usr/bin/env node
/**
 * tools/mcp-cli.mjs —— AIDEA MCP 调试客户端：模拟 Agent 向 MCP 服务器发指令并查看返回。
 *
 * 零依赖（Node ≥18 内置 fetch / readline）。默认自动读取应用配置（%APPDATA%/AIDEA/mcp.json）
 * 的端口与 token，无需手动复制；也可用 --port/--token/--config 覆盖。
 *
 * 用法：node tools/mcp-cli.mjs help
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'

const DEFAULT_PORT = 9876
const DEFAULT_TIMEOUT = 60_000

// ── 极简 ANSI 色彩（Windows Terminal / PowerShell 均可渲染；NO_COLOR 关闭）──
const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const c = {
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
  bold: paint(1),
}

class CliError extends Error {}

const USAGE = `AIDEA MCP 调试客户端（模拟 Agent 调用）

用法：node tools/mcp-cli.mjs <命令> [参数] [选项]

命令：
  ping                       健康检查（JSON-RPC ping）
  init                       MCP 握手（initialize，显示 serverInfo / 协议版本）
  tools [--full]             列出工具清单（--full 输出完整 manifest JSON）
  call <tool> [json|@file]   调用工具；args 为内联 JSON 或 @路径.json，缺省 {}
  outline [rootId] [depth]   = call aidea_outline（树状索引层，先大纲后细节）
  windows                    = call aidea_windows_list（列出窗口与 windowId）
  res                        resources/list（3 个 resource）
  read <uri>                 resources/read（如 aidea://view/current）
  shot [--board] [--max-width n] [--out <png>]
                             = call aidea_screenshot；返回的 PNG 存到 --out（默认 ./mcp-shot-<时间戳>.png）
  demo                       模拟一次 Agent 小流程：ping→init→tools→windows→overview→截图
  repl                       交互模式（逐条输入上述命令；exit 退出）
  help                       本帮助

选项：
  --port <n>                 端口（默认读配置文件，回退 ${DEFAULT_PORT}）
  --token <t>                Bearer token（默认读配置文件）
  --config <path>            指定配置文件路径（默认自动找 %APPDATA%/AIDEA/mcp.json 等）
  --url <url>                直接指定完整 URL（覆盖 --port）
  --timeout <ms>             单次请求超时（默认 ${DEFAULT_TIMEOUT}）
  --out <path>               结果含 image 时保存 PNG 到该路径
  --raw                      打印原始 JSON-RPC 响应（不做友好解析）
  --show-token               打印 token 明文（默认只显示前 6 位）

配置来源优先级：命令行 > 环境变量（MCP_URL / MCP_TOKEN / MCP_PORT）> mcp.json。

示例：
  node tools/mcp-cli.mjs ping
  node tools/mcp-cli.mjs tools
  node tools/mcp-cli.mjs call aidea_view_read
  node tools/mcp-cli.mjs call aidea_node_create '{"parentId":"root","texts":["想法A","想法B"]}'
  node tools/mcp-cli.mjs call aidea_batch @batch.json        # args 较大时用文件
  node tools/mcp-cli.mjs shot --board --out shot.png
  node tools/mcp-cli.mjs repl
`

// ── 参数解析 ──

const BOOL_FLAGS = new Set(['raw', 'full', 'board', 'show-token', 'help'])
const VALUE_FLAGS = new Set(['port', 'token', 'config', 'url', 'timeout', 'out', 'max-width'])

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    let key = arg.slice(2, eq === -1 ? undefined : eq)
    let value = eq === -1 ? undefined : arg.slice(eq + 1)
    key = key.toLowerCase()
    if (!BOOL_FLAGS.has(key) && !VALUE_FLAGS.has(key)) throw new CliError(`未知选项 --${key}`)
    if (BOOL_FLAGS.has(key)) {
      flags[key] = true
      continue
    }
    if (value === undefined) {
      value = argv[++i]
      if (value === undefined) throw new CliError(`选项 --${key} 缺少值`)
    }
    flags[key] = value
  }
  if (flags.help) positional.unshift('help')
  return { flags, positional }
}

// ── 配置解析（命令行 > 环境变量 > mcp.json）──

function candidateConfigPaths() {
  const list = []
  if (process.platform === 'win32' && process.env.APPDATA) {
    list.push(path.join(process.env.APPDATA, 'AIDEA', 'mcp.json'))
  }
  if (process.platform === 'darwin') {
    list.push(path.join(os.homedir(), 'Library', 'Application Support', 'AIDEA', 'mcp.json'))
  }
  list.push(path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'AIDEA', 'mcp.json'))
  return list
}

async function loadConfigFile(explicitPath) {
  for (const p of explicitPath ? [explicitPath] : candidateConfigPaths()) {
    try {
      return { path: p, config: JSON.parse(await fs.readFile(p, 'utf8')) }
    } catch {
      // 缺失/损坏 → 尝试下一个候选
    }
  }
  return null
}

async function resolveEndpoint(flags) {
  const found = await loadConfigFile(flags.config)
  const config = found?.config ?? null
  const envPort = Number.parseInt(process.env.MCP_PORT ?? '', 10)
  const flagPort = Number.parseInt(flags.port ?? '', 10)
  const port = Number.isInteger(flagPort) ? flagPort
    : Number.isInteger(envPort) ? envPort
    : Number.isInteger(config?.port) ? config.port
    : DEFAULT_PORT
  const url = flags.url ?? process.env.MCP_URL ?? `http://127.0.0.1:${port}/mcp`
  const token = flags.token ?? process.env.MCP_TOKEN ?? (typeof config?.token === 'string' ? config.token : null)
  return { url, token, port, configPath: found?.path ?? null }
}

function shortToken(token) {
  return token ? `${token.slice(0, 6)}…(${token.length} 字符)` : c.red('未配置')
}

// ── JSON-RPC 调用 ──

let rpcId = 0

function httpErrorHint(status) {
  switch (status) {
    case 401: return 'token 不匹配（设置面板可重置；重置后客户端配置需同步更新）'
    case 403: return 'Origin 被拒（服务器只放行无 Origin / 本机回环来源）'
    case 405: return '仅允许 POST /mcp'
    case 413: return '请求体过大'
    case 429: return '并发或频率超限（maxConcurrent / maxCallsPerMinute），稍后重试'
    default: return null
  }
}

async function rpcCall(endpoint, method, params, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(endpoint.token ? { Authorization: `Bearer ${endpoint.token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params !== undefined ? { params } : {}) }),
      signal: controller.signal,
    })
    const elapsed = Date.now() - started
    const text = await res.text()
    if (!res.ok) {
      const hint = httpErrorHint(res.status)
      throw new CliError(`HTTP ${res.status}${hint ? ` —— ${hint}` : ''}\n${c.dim(text.slice(0, 300))}`)
    }
    let body
    try {
      body = JSON.parse(text)
    } catch {
      throw new CliError(`响应不是合法 JSON：${c.dim(text.slice(0, 200))}`)
    }
    if (body.error) {
      throw new CliError(`JSON-RPC 错误 ${body.error.code}：${body.error.message}`)
    }
    return { body, result: body.result, elapsed }
  } catch (err) {
    if (err instanceof CliError) throw err
    if (err?.name === 'AbortError') throw new CliError(`请求超时（${timeoutMs}ms）——工具可能还在执行或服务器未响应`)
    const code = err?.cause?.code ?? err?.code
    if (code === 'ECONNREFUSED') {
      throw new CliError(`无法连接 ${endpoint.url}（ECONNREFUSED）—— app 未启动，或设置里 MCP 开关未打开？`)
    }
    throw new CliError(`请求失败：${code ?? ''} ${err?.message ?? err}`)
  } finally {
    clearTimeout(timer)
  }
}

/** 调用并打印（绝大多数命令共用）；--raw 时输出原始 JSON-RPC 响应 */
async function callAndPrint(endpoint, tool, args, flags, timeoutMs) {
  const { body, result, elapsed } = await rpcCall(endpoint, 'tools/call', { name: tool, arguments: args }, timeoutMs)
  if (flags.raw) {
    console.log(JSON.stringify(body, null, 2))
    return
  }
  printResult(result, flags)
  console.log(c.dim(`(${tool}, ${elapsed}ms)`))
}

function tryParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** MCP result（content 数组）→ 友好输出；>2k 字符默认截断展示（--full 看原文） */
async function printResult(result, flags) {
  const contents = result?.content ?? []
  if (result?.isError) console.log(c.red('✗ isError:true'))
  if (contents.length === 0) {
    console.log(c.dim('(空结果)'))
    return
  }
  for (const item of contents) {
    if (item.type === 'image') {
      if (flags.out) {
        await fs.writeFile(flags.out, Buffer.from(item.data, 'base64'))
        console.log(c.green(`✓ 图片已保存：${flags.out}（${item.mimeType}，base64 ${item.data.length} 字符）`))
      } else {
        console.log(c.yellow(`[image content: ${item.mimeType}，base64 ${item.data.length} 字符；加 --out <png> 保存]`))
      }
      continue
    }
    const raw = String(item.text ?? '')
    const parsed = tryParse(raw)
    const pretty = parsed !== undefined ? JSON.stringify(parsed, null, 2) : raw
    if (pretty.length > 2000 && !flags.full) {
      console.log(pretty.slice(0, 2000))
      console.log(c.yellow(`…（共 ${pretty.length} 字符，截断展示；加 --full 查看全文）`))
      continue
    }
    console.log(pretty)
  }
}

// ── 命令实现 ──

async function cmdPing(ctx) {
  const { body, elapsed } = await rpcCall(ctx.endpoint, 'ping', undefined, ctx.timeoutMs)
  if (ctx.flags.raw) return console.log(JSON.stringify(body, null, 2))
  const tokenNote = ctx.endpoint.token ? '' : c.red('（未配置 token，调用工具会 401）')
  console.log(c.green('✓ pong') + tokenNote)
  console.log(c.dim(`(${elapsed}ms)`))
}

async function cmdInit(ctx) {
  const { result, elapsed } = await rpcCall(ctx.endpoint, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'aidea-mcp-cli', version: '0.1.0' },
  }, ctx.timeoutMs)
  if (ctx.flags.raw) return console.log(JSON.stringify(result, null, 2))
  console.log(`protocolVersion: ${result.protocolVersion}`)
  console.log(`serverInfo:      ${result.serverInfo?.name} v${result.serverInfo?.version}`)
  console.log(c.dim(`(${elapsed}ms)`))
}

async function cmdTools(ctx) {
  const { result, elapsed } = await rpcCall(ctx.endpoint, 'tools/list', undefined, ctx.timeoutMs)
  if (ctx.flags.raw || ctx.flags.full) return console.log(JSON.stringify(result, null, 2))
  const tools = result.tools ?? []
  console.log(c.bold(`共 ${tools.length} 个工具：`))
  for (const t of tools) {
    const required = t.inputSchema?.required ?? []
    const props = Object.keys(t.inputSchema?.properties ?? {}).filter((k) => k !== 'windowId')
    console.log(`  ${c.cyan(t.name)}  ${c.dim(required.length ? `必填 ${required.join(', ')}` : '无必填')} · 可选 ${props.length ? props.join(', ') : '无'}`)
    console.log(`    ${c.dim(t.description.split('. ')[0] + '.')}`)
  }
  console.log(c.dim(`(${tools.length} tools, ${elapsed}ms)`))
}

/** 工具入参：内联 JSON 或 @文件路径（PowerShell/cmd 转义友好） */
async function parseCallArgs(raw) {
  if (raw === undefined) return {}
  if (raw.startsWith('@')) {
    const file = raw.slice(1)
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch (err) {
      throw new CliError(`无法读取参数文件 ${file}：${err.message}`)
    }
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new CliError(`args 不是合法 JSON：${err.message}（内联 JSON 建议用 @file 代替）`)
  }
}

async function cmdCall(ctx, positional) {
  const tool = positional[0]
  if (!tool) throw new CliError('用法：call <tool> [json|@file]')
  const args = await parseCallArgs(positional[1])
  await callAndPrint(ctx.endpoint, tool, args, ctx.flags, ctx.timeoutMs)
}

async function cmdResources(ctx) {
  const { result, elapsed } = await rpcCall(ctx.endpoint, 'resources/list', undefined, ctx.timeoutMs)
  if (ctx.flags.raw) return console.log(JSON.stringify(result, null, 2))
  for (const r of result.resources ?? []) {
    console.log(`  ${c.cyan(r.uri)}  ${c.dim(r.mimeType)}  ${r.description ?? r.name}`)
  }
  console.log(c.dim(`(${elapsed}ms)`))
}

async function cmdRead(ctx, positional) {
  const uri = positional[0]
  if (!uri) throw new CliError('用法：read <uri>（见 res 命令列出可用 uri）')
  const { result, elapsed } = await rpcCall(ctx.endpoint, 'resources/read', { uri }, ctx.timeoutMs)
  if (ctx.flags.raw) return console.log(JSON.stringify(result, null, 2))
  for (const item of result.contents ?? []) {
    console.log(c.dim(`# ${item.uri} (${item.mimeType})`))
    const parsed = item.mimeType?.includes('json') ? tryParse(item.text) : undefined
    console.log(parsed !== undefined ? JSON.stringify(parsed, null, 2) : item.text)
  }
  console.log(c.dim(`(${elapsed}ms)`))
}

async function cmdShot(ctx) {
  const args = {
    ...(ctx.flags.board ? { mode: 'board' } : {}),
    ...(ctx.flags['max-width'] ? { maxWidth: Number(ctx.flags['max-width']) } : {}),
  }
  const out = ctx.flags.out ?? path.join(process.cwd(), `mcp-shot-${Date.now()}.png`)
  const { result, elapsed } = await rpcCall(ctx.endpoint, 'tools/call', { name: 'aidea_screenshot', arguments: args }, ctx.timeoutMs)
  if (ctx.flags.raw) return console.log(JSON.stringify(result, null, 2))
  await printResult(result, { ...ctx.flags, out })
  console.log(c.dim(`(${elapsed}ms)`))
}

/** 模拟一次 Agent 小流程（每步容错，便于没有窗口/空项目时也能走通协议） */
async function cmdDemo(ctx) {
  const step = async (label, fn) => {
    console.log(c.bold(`\n── ${label} ──`))
    try {
      await fn()
    } catch (err) {
      console.log(c.yellow(`（跳过：${err.message.split('\n')[0]}）`))
    }
  }
  await step('ping', () => cmdPing(ctx))
  await step('initialize', () => cmdInit(ctx))
  await step('tools/list', () => cmdTools(ctx))
  await step('aidea_windows_list', () => callAndPrint(ctx.endpoint, 'aidea_windows_list', {}, ctx.flags, ctx.timeoutMs))
  await step('aidea_board_overview', () => callAndPrint(ctx.endpoint, 'aidea_board_overview', {}, ctx.flags, ctx.timeoutMs))
  console.log(c.green('\n✓ demo 结束'))
}

async function cmdRepl(ctx) {
  console.log(`连接 ${c.cyan(ctx.endpoint.url)} · token ${ctx.flags['show-token'] ? String(ctx.endpoint.token) : shortToken(ctx.endpoint.token)}`)
  console.log(c.dim('命令同 CLI；help 查看；exit / .exit 退出'))
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: c.cyan('aidea> ') })
  // 行队列：命令执行期间到达的行先缓冲（管道输入必需；TTY 交互行为不变）
  const queued = []
  let notify = null
  let rlClosed = false
  rl.on('close', () => {
    rlClosed = true
  })
  rl.on('line', (line) => {
    if (notify) {
      const resolve = notify
      notify = null
      resolve(line)
    } else {
      queued.push(line)
    }
  })
  const closed = new Promise((resolve) => rl.on('close', () => resolve(null)))
  const nextLine = async () => {
    if (queued.length > 0) return queued.shift()
    return Promise.race([
      new Promise((resolve) => {
        notify = resolve
      }),
      closed,
    ])
  }
  // stdin 关闭后 readline 不可再 prompt（ERR_USE_AFTER_CLOSE）；队列剩余行继续处理完
  const tryPrompt = () => {
    if (!rlClosed) rl.prompt()
  }
  try {
    tryPrompt()
    for (;;) {
      const line = (await nextLine())?.trim()
      if (!line) break // EOF / Ctrl+D / readline 关闭且队列已空
      if (line === 'exit' || line === 'quit' || line === '.exit') break
      if (line === 'help') {
        console.log(USAGE)
        tryPrompt()
        continue
      }
      try {
        const { flags, positional } = parseArgs(line.split(/\s+/))
        await dispatch({ ...ctx, flags }, positional)
      } catch (err) {
        console.log(c.red(`✗ ${err instanceof CliError ? err.message : String(err)}`))
      }
      tryPrompt()
    }
  } finally {
    rl.close()
  }
}

// ── 分发 ──

async function dispatch(ctx, positional) {
  const command = positional[0] ?? 'help'
  const rest = positional.slice(1)
  switch (command) {
    case 'ping': return cmdPing(ctx)
    case 'init': return cmdInit(ctx)
    case 'tools': return cmdTools(ctx)
    case 'call': return cmdCall(ctx, rest)
    case 'outline': {
      const args = {}
      if (rest[0]) args.rootId = rest[0]
      if (rest[1]) args.depth = Number(rest[1])
      return callAndPrint(ctx.endpoint, 'aidea_outline', args, ctx.flags, ctx.timeoutMs)
    }
    case 'windows':
    case 'win': return callAndPrint(ctx.endpoint, 'aidea_windows_list', {}, ctx.flags, ctx.timeoutMs)
    case 'res':
    case 'resources': return cmdResources(ctx)
    case 'read': return cmdRead(ctx, rest)
    case 'shot':
    case 'screenshot': return cmdShot(ctx)
    case 'demo': return cmdDemo(ctx)
    case 'repl': return cmdRepl(ctx)
    case 'help':
    default:
      console.log(USAGE)
      if (command !== 'help') throw new CliError(`未知命令：${command}`)
  }
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2))
  const endpoint = await resolveEndpoint(flags)
  const ctx = {
    endpoint,
    flags,
    timeoutMs: Number.parseInt(flags.timeout ?? '', 10) || DEFAULT_TIMEOUT,
  }
  if (!flags.raw && !flags['show-token']) {
    console.log(c.dim(`url ${endpoint.url} · token ${shortToken(endpoint.token)}${endpoint.configPath ? c.dim(` · 配置 ${endpoint.configPath}`) : ''}`))
  }
  await dispatch(ctx, positional)
}

main().catch((err) => {
  console.error(c.red(`✗ ${err instanceof CliError ? err.message : err?.stack ?? err}`))
  process.exit(1)
})
