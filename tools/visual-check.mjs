#!/usr/bin/env node
/**
 * visual-check.mjs — 视觉回归（明暗双主题）
 *
 * 流程：用 agent-browser 打开正在运行的 dsh web，分别以亮色 / 暗色配色方案
 * 截图到 _shots/，再与 design/shot-baseline/ 里的基线图比较。
 *
 *   node tools/visual-check.mjs --write     # 写入/更新基线
 *   node tools/visual-check.mjs             # 与基线比较
 *   node tools/visual-check.mjs --skip-capture   # 用 _shots 里已有截图直接比较
 *
 * 依赖：sharp（图片解码）。本机可用 EF_SHARP_PATH 指向已安装的 sharp；
 * 仓库正式使用时建议加为 devDependency。
 * 环境变量：
 *   EF_BASE_URL      默认 http://127.0.0.1:3080
 *   EF_BROWSER_CMD   默认 agent-browser（可加 --executable-path 等参数）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, '_shots')
const BASELINE = join(ROOT, 'design', 'shot-baseline')
const BASE_URL = process.env.EF_BASE_URL ?? 'http://127.0.0.1:3080'
/** 浏览器命令：EF_BROWSER_CMD 可执行文件 + EF_BROWSER_ARGS（JSON 数组，避免空格引号歧义）。 */
const BROWSER_CMD = process.env.EF_BROWSER_CMD ?? 'agent-browser'
const BROWSER_ARGS = JSON.parse(process.env.EF_BROWSER_ARGS ?? '[]')
const THEMES = ['dark', 'light']
const BASELINE_WIDTH = 640
/** 基线用 JPEG（美术层上线后 PNG 基线各 350+ KB，JPEG 约 1/3）。 */
const BASELINE_EXT = 'jpg'
const VIEWPORT = '1600 900'
/** 允许的差异：平均通道差 ≤ 6/255，且差异像素占比 ≤ 8%。
    基线是 640px JPEG，本身带压缩噪声（美术层上线后噪声更明显）；
    这是**粗粒度**回归——抓布局/配色/资产缺失，不抓抗锯齿级别的差异。 */
const MAX_MEAN_DIFF = 6
const MAX_DIFF_FRACTION = 0.08

async function loadSharp() {
  const candidates = ['sharp', process.env.EF_SHARP_PATH].filter(Boolean)
  for (const c of candidates) {
    try {
      const spec = c === 'sharp' ? 'sharp' : pathToFileURL(c).href
      const mod = await import(spec)
      return mod.default ?? mod
    } catch { /* 试下一个 */ }
  }
  console.log('需要 sharp 才能解码图片：npm i -D sharp，或设置 EF_SHARP_PATH 指向已安装的 sharp/dist/index.cjs')
  process.exit(2)
}

const winQuote = (v) => (/[\s"]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v)

/** 通过 shell 执行浏览器命令（npm 全局命令在 Windows 上是 .cmd 垫片，交给 shell 最省事）。 */
function run(...args) {
  const line = [BROWSER_CMD, ...BROWSER_ARGS, ...args].map(winQuote).join(' ')
  const result = spawnSync(line, { shell: true, stdio: 'pipe', encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error('浏览器命令失败：' + line + '\n' + String(result.stderr ?? '').slice(0, 400))
  }
}

async function capture(sharp) {
  mkdirSync(SHOTS, { recursive: true })
  run('set', 'viewport', ...VIEWPORT.split(' '))
  /** 截图前冻结动效：噪点是逐帧随机、视差跟鼠标，不冻结的话基线永远对不上。 */
  const freeze = () => run('eval',
    'const s=document.createElement("style");'
    + 's.textContent=".ef-hud-edges,.ef-hud-deco .flash{display:none!important}'
    + '.ef-hud-deco *,.ef-hud-bg,.ef-hud-emblem{transform:none!important}";'
    + 'document.head.appendChild(s);"frozen"')

  for (const theme of THEMES) {
    run('open', BASE_URL + '/')
    run('wait', '7000')
    freeze()
    if (theme === 'light') {
      // 直接摘掉官方主题键，比模拟 prefers-color-scheme 可靠：
      // 用户把外观偏好钉成 dark 时，媒体模拟不会改变页面。
      run('eval', 'document.body.removeAttribute("data-ds-dark-theme");"light"')
      run('wait', '800')
    }
    run('screenshot', join(SHOTS, 'visual-' + theme + '.png'))
    console.log('  截图 _shots/visual-' + theme + '.png')
  }
  run('close')
  return sharp
}

async function fingerprint(sharp, file) {
  const { data, info } = await sharp(file)
    .resize(BASELINE_WIDTH, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  return {
    width: info.width,
    height: info.height,
    mean: sum / data.length,
    data,
  }
}

function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { ok: false, reason: '尺寸不同 ' + a.width + 'x' + a.height + ' vs ' + b.width + 'x' + b.height }
  }
  let diffSum = 0
  let diffCount = 0
  const n = a.data.length
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a.data[i] - b.data[i])
    diffSum += d
    if (d > 12) diffCount++
  }
  const meanDiff = diffSum / n
  const fraction = diffCount / n
  return {
    ok: meanDiff <= MAX_MEAN_DIFF && fraction <= MAX_DIFF_FRACTION,
    meanDiff: +meanDiff.toFixed(3),
    fraction: +(fraction * 100).toFixed(3),
    meanA: +a.mean.toFixed(1),
    meanB: +b.mean.toFixed(1),
  }
}

const sharp = await loadSharp()
const write = process.argv.includes('--write')
const captureEnabled = process.argv.includes('--capture')
if (captureEnabled) await capture(sharp)
else if (!existsSync(join(SHOTS, 'visual-dark.png'))) {
  console.log('没有现成截图：加 --capture 让本工具自己开浏览器采集（需要 agent-browser + 正在运行的 dsh web）')
  process.exit(2)
}

mkdirSync(BASELINE, { recursive: true })
let fail = 0
for (const theme of THEMES) {
  const shot = join(SHOTS, 'visual-' + theme + '.png')
  const base = join(BASELINE, theme + '.' + BASELINE_EXT)
  if (!existsSync(shot)) { console.log('  ✗ 缺少截图 ' + shot); fail++; continue }
  if (write || !existsSync(base)) {
    await sharp(shot).resize(BASELINE_WIDTH, null, { fit: 'inside' }).jpeg({ quality: 86, mozjpeg: true }).toFile(base)
    console.log('  ' + (write ? '更新' : '建立') + '基线 design/shot-baseline/' + theme + '.' + BASELINE_EXT)
    continue
  }
  const result = compare(await fingerprint(sharp, base), await fingerprint(sharp, shot))
  if (!result.ok) fail++
  console.log('  ' + (result.ok ? '✓' : '✗') + ' ' + theme.padEnd(6)
    + ' 平均差 ' + String(result.meanDiff ?? '-').padStart(6)
    + '  差异像素 ' + String(result.fraction ?? '-').padStart(6) + '%'
    + '  (阈值 ' + MAX_MEAN_DIFF + ' / ' + MAX_DIFF_FRACTION * 100 + '%)'
    + (result.reason === undefined ? '' : '  ' + result.reason))
}
console.log('\n' + (fail === 0 ? '视觉回归通过' : '视觉回归失败：' + fail + ' 项') + '\n')
process.exit(fail === 0 ? 0 : 1)
