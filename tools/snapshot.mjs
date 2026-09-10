#!/usr/bin/env node
/**
 * snapshot.mjs — 皮肤基线快照（代码/资产层，不依赖浏览器）
 *
 * 记录随包发布的每个文件的 sha256 与样式表规模指标，写入 design/baseline.json。
 * 之后任何改动都可以用 --check 比对，回答"这一轮到底动了什么"。
 *
 * 用法：
 *   node tools/snapshot.mjs           # 写入/更新基线
 *   node tools/snapshot.mjs --check   # 与基线比对
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'design', 'baseline.json')
const TRACKED = ['assets', 'client', 'host', 'design/tokens.json', 'cordis.patch.yml', 'package.json']

function walk(target) {
  const abs = join(ROOT, target)
  if (!existsSync(abs)) return []
  if (statSync(abs).isFile()) return [abs]
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => walk(join(target, e.name)))
}
const files = [...new Set(TRACKED.flatMap(walk))].sort()
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)

const cssRaw = readFileSync(join(ROOT, 'assets', 'skin.css'))
const css = cssRaw.toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const metrics = {
  tokenOverrides: (css.match(/--dsw-[a-z0-9-]+\s*:/g) ?? []).length,
  ruleBlocks: (css.match(/\{/g) ?? []).length,
  dataAnchorSelectors: (css.match(/\[data-/g) ?? []).length,
  fontFaces: (css.match(/@font-face/g) ?? []).length,
  importantOutsideReducedMotion: (css.replace(/@media\s*\(prefers-reduced-motion[\s\S]*?\n\}/g, '').match(/!important/g) ?? []).length,
  cssBytes: cssRaw.length,
}

const current = {
  generatedAt: new Date().toISOString(),
  metrics,
  files: Object.fromEntries(files.map((p) => [relative(ROOT, p).split('\\').join('/'), hash(p)])),
}

if (!process.argv.includes('--check')) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n', 'utf8')
  console.log('基线已写入 design/baseline.json')
  console.log('  文件: ' + files.length + ' 个   token 覆盖: ' + metrics.tokenOverrides
    + '   data-* 选择器: ' + metrics.dataAnchorSelectors + '   skin.css: ' + metrics.cssBytes + ' 字节')
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.log('没有基线文件，先跑一次 node tools/snapshot.mjs')
  process.exit(1)
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const added = []
const changed = []
for (const [f, h] of Object.entries(current.files)) {
  if (base.files[f] === undefined) added.push(f)
  else if (base.files[f] !== h) changed.push(f)
}
const removed = Object.keys(base.files).filter((f) => current.files[f] === undefined)

console.log('基线比对（' + base.generatedAt + ' → 现在）')
console.log('  文件: ' + Object.keys(current.files).length + ' 个（+ ' + added.length + ' / ~ ' + changed.length + ' / - ' + removed.length + '）')
if (added.length) console.log('  新增: ' + added.join(', '))
if (changed.length) console.log('  修改: ' + changed.join(', '))
if (removed.length) console.log('  删除: ' + removed.join(', '))
for (const k of Object.keys(metrics)) {
  const d = metrics[k] - (base.metrics[k] ?? 0)
  if (d !== 0) console.log('  指标 ' + k + ': ' + base.metrics[k] + ' → ' + metrics[k] + '  (' + (d > 0 ? '+' : '') + d + ')')
}
process.exit(0)
