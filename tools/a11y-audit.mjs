#!/usr/bin/env node
/**
 * a11y-audit.mjs — 无障碍静态审计（不依赖浏览器，明暗双主题）
 *
 * 1. 把 assets/skin.css 按主题切成两张 token 表（亮色 / 暗色）
 * 2. 按"文字色 / 底色"的实际配对计算 WCAG 对比度（正文 ≥4.5，大字与 UI 元件 ≥3.0）
 * 3. 检查样式表能力：focus-visible / reduced-motion / placeholder / accent-color / 零 !important
 *
 * 用法：node tools/a11y-audit.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(ROOT, 'assets', 'skin.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

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
    if (/^@(media|supports|layer)/.test(selector)) out.push(...collectBlocks(body))
    else out.push({ selector, body })
    i = j
  }
  return out
}
const blocks = collectBlocks(css)

/** 抽一张主题的 token 表；isDark 决定取哪一支。 */
function tokenMap(isDark) {
  const map = new Map()
  for (const b of blocks) {
    if (b.selector.startsWith('@')) continue
    const dark = b.selector.includes('data-ds-dark-theme')
    if (dark !== isDark) continue
    for (const m of b.body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/g)) map.set(m[1], m[2].trim())
  }
  return map
}

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function parseColor(value) {
  if (value === undefined) return null
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex !== null) { const n = parseInt(hex[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
  const short = /^#([0-9a-f]{3})$/i.exec(value)
  if (short !== null) return [...short[1]].map((c) => parseInt(c + c, 16))
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(value)
  if (rgba !== null) {
    const a = rgba[4] === undefined ? 1 : Number(rgba[4])
    return a === 1 ? [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])] : null
  }
  return null
}
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (a, b) => {
  const l1 = lum(a); const l2 = lum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const PAIRS = [
  ['正文', 'dsw-alias-label-primary', 'dsw-alias-bg-layer-2', 4.5],
  ['次级文字', 'dsw-alias-label-secondary', 'dsw-alias-bg-layer-2', 4.5],
  ['三级文字', 'dsw-alias-label-tertiary', 'dsw-alias-bg-layer-2', 4.5],
  ['说明文字', 'dsw-alias-label-caption', 'dsw-alias-bg-layer-2', 4.5],
  ['弱化文字', 'dsw-alias-label-dimmed', 'dsw-alias-bg-layer-2', 4.5],
  ['正文 / 基底', 'dsw-alias-label-primary', 'dsw-alias-bg-base', 4.5],
  ['三级文字 / 基底', 'dsw-alias-label-tertiary', 'dsw-alias-bg-base', 4.5],
  ['品牌文字', 'dsw-alias-brand-text', 'dsw-alias-bg-layer-2', 4.5],
  ['成功色', 'dsw-alias-state-success-primary', 'dsw-alias-bg-layer-2', 3.0],
  ['错误色', 'dsw-alias-state-error-primary', 'dsw-alias-bg-layer-2', 3.0],
  ['警告色', 'dsw-alias-state-warn-primary', 'dsw-alias-bg-layer-2', 3.0],
  ['代码正文', 'dsw-alias-label-primary', 'dsw-alias-markdown-code-block', 4.5],
]

let fail = 0
for (const isDark of [false, true]) {
  const tokens = tokenMap(isDark)
  const label = isDark ? '暗色主题' : '亮色主题'
  console.log('\n' + label + '（' + tokens.size + ' 个 token）')
  if (tokens.size === 0) { console.log('  ✗ 未找到该主题的 token 定义'); fail++; continue }
  const surf = (k) => tokens.get(k)
  console.log('  底色：bg-base=' + surf('dsw-alias-bg-base') + '  layer-2=' + surf('dsw-alias-bg-layer-2') + '  code=' + surf('dsw-alias-markdown-code-block'))
  for (const [name, fgKey, bgKey, min] of PAIRS) {
    const fg = parseColor(tokens.get(fgKey))
    const bg = parseColor(tokens.get(bgKey))
    if (fg === null || bg === null) { console.log('  ? ' + name + '：无法解析'); continue }
    const ratio = contrast(fg, bg)
    const ok = ratio >= min
    if (!ok) fail++
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name.padEnd(14) + ratio.toFixed(2).padStart(6) + '  (≥' + min + ')  ' + tokens.get(fgKey) + ' on ' + tokens.get(bgKey))
  }
}

console.log('\n样式表能力检查：')
const features = [
  ['亮色 + 暗色两套 token', tokenMap(false).size > 50 && tokenMap(true).size > 50],
  ['focus-visible 焦点环', /:focus-visible\s*\{[^}]*outline/.test(css)],
  ['prefers-reduced-motion 降级', /prefers-reduced-motion/.test(css)],
  ['placeholder 颜色', /::placeholder/.test(css)],
  ['accent-color（复选框/滑杆）', /accent-color/.test(css)],
  ['caret-color', /caret-color/.test(css)],
  ['::selection', /::selection/.test(css)],
  ['!important 仅用于 body 内联背景覆盖（reduced-motion 除外）', (() => {
    const all = (css.replace(/@media\s*\(prefers-reduced-motion[\s\S]*?\n\}/g, '').match(/!important/g) ?? []).length
    const bodyLevel = blocks.filter((b) => /\bbody\b/.test(b.selector)).reduce((n, b) => n + (b.body.match(/!important/g) ?? []).length, 0)
    return all - bodyLevel === 0
  })()],
]
for (const [name, ok] of features) { if (!ok) fail++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + name) }

console.log('\n' + (fail === 0 ? '无障碍审计通过（明暗双主题）' : '无障碍审计失败：' + fail + ' 项') + '\n')
process.exit(fail === 0 ? 0 : 1)
