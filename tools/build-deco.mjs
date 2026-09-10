#!/usr/bin/env node
/**
 * build-deco.mjs — 生成侧栏竖排装饰文字与右侧栏标志
 *
 * 装饰文字用浏览器真实渲染（这样才用得上我们的 woff2 字体），再把渲染结果
 * 的亮度转成 alpha、按主题染色，输出透明 WebP，供 CSS 当背景图用。
 *
 *   node tools/build-deco.mjs
 *   node tools/build-deco.mjs --keep-html
 *
 * 环境变量：EF_SHARP_PATH / EF_BROWSER_CMD / EF_BROWSER_ARGS（同 visual-check）
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'assets', 'art')
const TMP = join(ROOT, '_shots')
const BROWSER_CMD = process.env.EF_BROWSER_CMD ?? 'agent-browser'
const BROWSER_ARGS = JSON.parse(process.env.EF_BROWSER_ARGS ?? '[]')
process.env.AGENT_BROWSER_SOCKET_DIR = process.env.AGENT_BROWSER_SOCKET_DIR ?? join(ROOT, '.ab-sock')

async function loadSharp() {
  for (const c of ['sharp', process.env.EF_SHARP_PATH].filter(Boolean)) {
    try {
      const mod = await import(c === 'sharp' ? 'sharp' : pathToFileURL(c).href)
      return mod.default ?? mod
    } catch { /* 试下一个 */ }
  }
  console.log('需要 sharp：npm i -D sharp，或设置 EF_SHARP_PATH')
  process.exit(2)
}
const sharp = await loadSharp()

const winQuote = (v) => (/[\s"]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v)
function run(...args) {
  const line = [BROWSER_CMD, ...BROWSER_ARGS, ...args].map(winQuote).join(' ')
  const result = spawnSync(line, { shell: true, stdio: 'pipe', encoding: 'utf8' })
  if (result.status !== 0) throw new Error('浏览器命令失败：' + line + '\n' + String(result.stderr ?? '').slice(0, 400))
  return String(result.stdout ?? '')
}

const FONT = (file) => pathToFileURL(join(ROOT, 'assets', 'fonts', file)).href

/** 竖排装饰文字模板：黑底白字，稍后按亮度转 alpha。 */
function decoHtml(width, height) {
  const css = [
    "@font-face{font-family:'Novecento Wide';src:url('" + FONT('NovecentoWide-Bold.woff2') + "') format('woff2');font-weight:700}",
    "@font-face{font-family:'Novecento Wide';src:url('" + FONT('NovecentoWide-DemiBold.woff2') + "') format('woff2');font-weight:600}",
    "@font-face{font-family:'Gilroy';src:url('" + FONT('Gilroy-Medium.woff2') + "') format('woff2');font-weight:500}",
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:' + width + 'px;height:' + height + 'px;background:#000;overflow:hidden}',
    '.deco{width:' + width + 'px;height:' + height + 'px;writing-mode:vertical-rl;text-orientation:mixed;',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;font-family:Gilroy,sans-serif}',
    '.deco b{font-family:"Novecento Wide",Gilroy,sans-serif;font-weight:700;font-size:62px;line-height:1;letter-spacing:.16em}',
    '.deco i{font-style:normal;font-size:13px;letter-spacing:.34em}',
    '.deco u{text-decoration:none;font-size:10px;letter-spacing:.30em;opacity:.72}',
  ].join('')
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>'
    + '<div class="deco"><b>HARNESS</b><i>DEEPSEEK</i><u>ENDFIELD HUD</u><u>TALOS-II // 04</u></div>'
    + '</body></html>'
}

/** 亮度 → alpha，染成指定颜色，并烘入不透明度；rotateDeg 用于把竖排文字翻 180°。 */
async function toTintedAlpha(srcPng, color, alpha, dest, rotateDeg = 0) {
  let pipe = sharp(srcPng)
  if (rotateDeg !== 0) pipe = pipe.rotate(rotateDeg)
  const { data, info } = await pipe.greyscale().raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < data.length; i++) {
    out[i * 4] = color[0]
    out[i * 4 + 1] = color[1]
    out[i * 4 + 2] = color[2]
    out[i * 4 + 3] = Math.round(data[i] * alpha)
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 95, effort: 5 })
    .toFile(dest)
  return { w: info.width, h: info.height, kb: statSync(dest).size / 1024 }
}

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })

const W = 260
const H = 820
const htmlFile = join(TMP, 'deco.html')
const shot = join(TMP, 'deco-render.png')
writeFileSync(htmlFile, decoHtml(W, H), 'utf8')
run('set', 'viewport', String(W), String(H))
run('open', pathToFileURL(htmlFile).href)
run('wait', '1500')
run('screenshot', shot)
console.log('  渲染 ' + W + 'x' + H + ' 竖排装饰文字（HARNESS 最大）')

for (const [name, color] of [
  ['sidebar-deco-dark.webp', [230, 230, 230]],
  ['sidebar-deco-light.webp', [25, 25, 25]],
]) {
  // 竖排装饰文字整体旋转 180°：字头朝下（主人指定）
  const r = await toTintedAlpha(shot, color, 0.40, join(OUT, name), 180)
  console.log('  ✓ ' + name.padEnd(26) + r.kb.toFixed(1).padStart(6) + ' KB  ' + r.w + 'x' + r.h)
}

/* ---- 右侧栏标志：源图自带 alpha，这里只缩尺寸 + 亮色主题染色 ---- */
const LOGO_SRC = join(ROOT, '_refs', 'img', '3a460767-endfield.bcc6fe39.png')
try {
  const base = await sharp(LOGO_SRC).resize({ width: 420, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (const [name, tint] of [['logo-dark.webp', null], ['logo-light.webp', [30, 30, 30]]]) {
    let pipe
    if (tint === null) {
      pipe = sharp(base.data, { raw: { width: base.info.width, height: base.info.height, channels: 4 } })
    } else {
      const out = Buffer.alloc(base.info.width * base.info.height * 4)
      for (let i = 0; i < base.info.width * base.info.height; i++) {
        out[i * 4] = tint[0]
        out[i * 4 + 1] = tint[1]
        out[i * 4 + 2] = tint[2]
        out[i * 4 + 3] = base.data[i * 4 + 3]
      }
      pipe = sharp(out, { raw: { width: base.info.width, height: base.info.height, channels: 4 } })
    }
    const dest = join(OUT, name)
    await pipe.webp({ quality: 88, alphaQuality: 95, effort: 5 }).toFile(dest)
    const m = await sharp(dest).metadata()
    console.log('  ✓ ' + name.padEnd(26) + (statSync(dest).size / 1024).toFixed(1).padStart(6) + ' KB  ' + m.width + 'x' + m.height)
  }
} catch (error) {
  console.log('  ✗ 标志处理失败：' + String(error.message).slice(0, 140))
}

run('close')
if (!process.argv.includes('--keep-html')) {
  rmSync(htmlFile, { force: true })
  rmSync(shot, { force: true })
}
console.log('\n完成 → assets/art/')
