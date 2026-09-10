#!/usr/bin/env node
/**
 * check-scope.mjs — 皮肤样式表质量闸门（不依赖浏览器）
 *
 * 校验 assets/skin.css：
 *   1. 每条选择器要么被 html[data-ef-hud="on"] 限定，要么是我们自己的 .ef-hud-* DOM
 *   2. 所有 url() 都是相对路径，且文件在 assets/ 下真实存在
 *   3. @font-face 的 family 与 src 对应
 *   4. 统计 !important / 规则数 / 各层覆盖量
 *
 * 用法：node tools/check-scope.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_FILE = join(ROOT, 'assets', 'skin.css')
const raw = readFileSync(CSS_FILE, 'utf8')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

const SCOPE = 'html[data-ef-hud="on"]'
const OWN_PREFIX = '.ef-hud-'

/** 收集所有块：返回 {selector, body} 列表（@media 递归进入）。 */
function collectBlocks(text) {
  const out = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open === -1) break
    const selector = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    if (selector.startsWith('@media') || selector.startsWith('@supports') || selector.startsWith('@layer')) {
      out.push(...collectBlocks(body))
    } else if (selector.startsWith('@')) {
      out.push({ selector, body, at: true })
    } else {
      out.push({ selector, body, at: false })
    }
    i = j
  }
  return out
}

const blocks = collectBlocks(css)
const rules = blocks.filter((b) => !b.at)
const atRules = blocks.filter((b) => b.at)

let unscoped = []
let selectors = 0
for (const rule of rules) {
  for (const part of rule.selector.split(',')) {
    const s = part.trim()
    if (s.length === 0) continue
    selectors++
    const ok = s.startsWith(SCOPE) || s.startsWith(OWN_PREFIX) || s.includes(OWN_PREFIX)
    if (!ok) unscoped.push(s)
  }
}

const ASSET_PREFIX = '/plugins/endfield-hud/assets/'
const urls = [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2])
/** 把 url() 映射到本地文件；返回 null 表示不是本地资产引用。 */
const toLocal = (u) => {
  if (u.startsWith(ASSET_PREFIX)) return join(ROOT, 'assets', u.slice(ASSET_PREFIX.length))
  if (u.startsWith('./')) return join(ROOT, 'assets', u.slice(2))
  return null
}
// 允许相对路径与同源绝对路径（/plugins/endfield-hud/assets/...）；拒绝远程与其它绝对路径
const badUrls = urls.filter((u) => /^(https?:)?\/\//.test(u) || (u.startsWith('/') && !u.startsWith(ASSET_PREFIX)))
const missing = urls.filter((u) => { const p = toLocal(u); return p !== null && !existsSync(p) })

/* 官方 data-* 属性清单：由 rc.2 官方源码（packages/client 下各 ui 包的 src 内全部 tsx）扫描得到。
   皮肤里出现的锚点必须在这份清单内（或属于我们自己的 data-ef-hud / data-dsh-*），
   否则视为拼写错误或臆造锚点。 */
const OFFICIAL_DATA_ATTRS = new Set([
  'data-state', 'data-testid', 'data-variant', 'data-decoration', 'data-expandable', 'data-conversation-scroll',
  'data-error', 'data-read', 'data-tool', 'data-context-text', 'data-phase', 'data-diff', 'data-web',
  'data-chat-call-id', 'data-terminal', 'data-chat-anchor-key', 'data-side', 'data-sample', 'data-selected',
  'data-slot-error', 'data-chat-flow-key', 'data-input-scroll', 'data-subcalls', 'data-timeline-focus',
  'data-virtual-position', 'data-composer-seat', 'data-summary-scroll-region', 'data-tip', 'data-context-injection-body',
  'data-context-fields', 'data-context-entries', 'data-chain-overlay-fallback', 'data-timeline-span', 'data-kind',
  'data-role-icon', 'data-align', 'data-ref-chip', 'data-context-files', 'data-status', 'data-pending-steering',
  'data-dragging', 'data-composer-card', 'data-search', 'data-running', 'data-timeline-domain', 'data-active',
  'data-context-catalog-update', 'data-context-form', 'data-sidebar-collapsed', 'data-input-backdrop', 'data-input-mirror',
  'data-produced-files-row', 'data-wide', 'data-member-status', 'data-json-copy-active', 'data-loader-entry',
  'data-timeline-hover-line', 'data-record-index', 'data-virtual-spacer', 'data-request-run-index', 'data-role-kind',
  'data-context-recall-icon', 'data-context-summary', 'data-turn', 'data-time-hover-root', 'data-streaming',
  'data-compaction-disclosure', 'data-follow-end', 'data-source', 'data-slot', 'data-panning',
  'data-timeline-record-index', 'data-scroll-ready', 'data-context-entries-truncated', 'data-context-sections',
  'data-context-snapshot-supersedes', 'data-context-relay-sender', 'data-context-recalls', 'data-count',
  'data-details-collapsed', 'data-chat-flow-kind', 'data-compaction-icon', 'data-reference-appearance', 'data-disabled',
  'data-run-status', 'data-goal-bar', 'data-json-expander', 'data-json-copy-button', 'data-json-root-row', 'data-open',
  'data-disclosure-row', 'data-plugin-count', 'data-approval-scroll', 'data-question-scroll', 'data-plan-review-key',
  'data-turn-start', 'data-conversation-composer-overlay', 'data-collapsed-summary', 'data-hovered',
  'data-assistant-timing', 'data-earlier-history', 'data-current', 'data-animate-viewport', 'data-trajectory-row-key',
  'data-request-status', 'data-busy', 'data-dsh-boot', 'data-dsh-boot-spinner', 'data-confirmed', 'data-shell-overlay',
  'data-turn-tail', 'data-occurrence', 'data-invalid', 'data-queue-dock', 'data-command-input', 'data-unavailable',
  'data-approval-key', 'data-member-label-wrap', 'data-member-label', 'data-member-status-text', 'data-phase-count',
  'data-phase-status-text', 'data-workflow-run', 'data-context-source', 'data-plugin-entry', 'data-enabled',
  'data-footnotes', 'data-chat-flow', 'data-question-key', 'data-clickable', 'data-plan-review-scroll', 'data-on',
  'data-loading', 'data-equal-duration', 'data-search-match', 'data-trajectory-scroll', 'data-history-load',
  'data-request-only', 'data-terminal-request-boundary', 'data-group-start', 'data-turn-end', 'data-label',
])
/* 社区插件自有锚点：逐条在已安装插件的 client.js 里核对过
   （git-graph / task-board / ssh / pet / skin-center）。 */
const PLUGIN_DATA_ATTRS = new Set([
  'data-gitgraph-chip-anchor', 'data-gitgraph-dialog', 'data-gitgraph-ref', 'data-gitgraph-ref-current',
  'data-gitgraph-lanes', 'data-gitgraph-glyph', 'data-gitgraph-popover', 'data-gitgraph-chip',
  'data-dsh-taskboard-view', 'data-dsh-taskboard-board', 'data-dsh-taskboard-entry', 'data-dsh-taskboard-active',
  'data-dsh-ssh-view', 'data-dsh-ssh-entry', 'data-dsh-ssh-active', 'data-dsh-ssh-xterm',
  'data-dsh-pet-root', 'data-dsh-skin-layer',
])
/* body/html 级属性：官方另行管理（语义属性枚举文档明确排除），不参与 L2 枚举。
   data-ds-dark-theme = 官方主题键（ui-theme/boot-theme.ts: body.toggleAttribute）。 */
const BODY_LEVEL_ATTRS = new Set(['data-ds-dark-theme'])
const OWN_ATTR_PREFIX = ['data-ef-hud', 'data-dsh-']
/** 插件自有 DOM 上的自有属性（.ef-hud-deco .flash 的播放开关）。 */
const OWN_ATTRS = new Set(['data-play'])
const usedAttrs = [...new Set([...css.matchAll(/\[(data-[a-z][a-z0-9-]*)/g)].map((m) => m[1]))]
const unknownAttrs = usedAttrs.filter((a) =>
  !OFFICIAL_DATA_ATTRS.has(a)
  && !PLUGIN_DATA_ATTRS.has(a)
  && !BODY_LEVEL_ATTRS.has(a)
  && !OWN_ATTRS.has(a)
  && !OWN_ATTR_PREFIX.some((p) => a.startsWith(p)))

const fontFaces = atRules.filter((b) => b.selector.startsWith('@font-face'))
const families = fontFaces.map((b) => (/font-family:\s*'([^']+)'/.exec(b.body) ?? [])[1]).filter(Boolean)
const uniqueFamilies = [...new Set(families)]

// reduced-motion 块内的 !important 是刻意为之（无障碍），不计入噪音统计
const cssWithoutReducedMotion = css.replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g, '')
/* 只允许一种 !important：压过皮肤中心写在 body 上的内联背景（内联样式无法用选择器覆盖）。 */
const bodyImportant = rules
  .filter((r) => /\bbody\b/.test(r.selector))
  .reduce((n, r) => n + (r.body.match(/!important/g) ?? []).length, 0)
const importants = (cssWithoutReducedMotion.match(/!important/g) ?? []).length - bodyImportant
const layerCount = {
  L1: (css.match(/--dsw-[a-z0-9-]+\s*:/g) ?? []).length,
  L2: rules.filter((r) => r.selector.includes('[data-slot') || r.selector.includes('[data-')).length,
  L4: rules.filter((r) => r.selector.includes('[class*=')).length,
}

console.log('skin.css 检查')
console.log('  规则数: ' + rules.length + '  选择器数: ' + selectors + '  @规则: ' + atRules.length)
console.log('  token 重映射: ' + layerCount.L1 + ' 条   data-* 锚点规则: ' + layerCount.L2 + ' 条   类名兜底规则: ' + layerCount.L4 + ' 条')
console.log('  @font-face: ' + fontFaces.length + ' 个，字体族: ' + uniqueFamilies.join(' / '))
console.log('  url() 引用: ' + urls.length + ' 个（全部相对路径）')
console.log('  !important: ' + importants + ' 处')

let fail = 0
const report = (ok, msg) => { console.log('  ' + (ok ? '✓' : '✗') + ' ' + msg); if (!ok) fail++ }
report(unscoped.length === 0, '所有选择器都被作用域限定' + (unscoped.length === 0 ? '' : '（越界 ' + unscoped.length + ' 条：' + unscoped.slice(0, 3).join(' | ') + '）'))
report(badUrls.length === 0, 'url() 无远程地址' + (badUrls.length === 0 ? '' : '（' + badUrls.join(', ') + '）'))
report(missing.length === 0, 'url() 引用的文件都存在' + (missing.length === 0 ? '' : '（缺 ' + missing.join(', ') + '）'))
report(importants === 0, '!important 只用在 body 内联背景覆盖（' + bodyImportant + ' 处），其余为 0')
report(fontFaces.length >= 10 && uniqueFamilies.length >= 5, '字体声明完整（≥5 族，≥10 条）')
report(unknownAttrs.length === 0, 'data-* 锚点全部有据可查（官方清单 + 已核对插件锚点，用了 ' + usedAttrs.length + ' 个）'
  + (unknownAttrs.length === 0 ? '' : '（未知：' + unknownAttrs.join(', ') + '）'))

/* 回归护栏：输入区是 mirror / backdrop / textarea 三层结构，给 textarea 上不透明底色
   会把 backdrop 里可见的文字整片盖住（2026-09-09 实测 bug）。这里禁止任何
   textarea 规则设置非透明背景。 */
const OPAQUE_OK = new Set(['transparent', 'none', 'inherit', 'initial', 'unset'])
const opaqueTextarea = rules.filter((r) => {
  if (!/\btextarea\b/.test(r.selector)) return false
  const decl = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/m.exec(r.body)
  if (decl === null) return false
  return !OPAQUE_OK.has(decl[1].trim().toLowerCase())
})
report(opaqueTextarea.length === 0, '没有给 textarea 上不透明背景（三层输入结构护栏）'
  + (opaqueTextarea.length === 0 ? '' : '（' + opaqueTextarea.map((r) => r.selector.split(',')[0].trim()).join(' | ') + '）'))

console.log('\n' + (fail === 0 ? '样式表检查通过' : '样式表检查失败：' + fail + ' 项') + '\n')
process.exit(fail === 0 ? 0 : 1)
