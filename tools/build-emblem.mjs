#!/usr/bin/env node
/**
 * build-emblem.mjs — 生成 HUD 徽章（空会话页中央的同心环 / 刻度 / 准星）
 *
 * 纯几何、纯矢量、无位图：几何全部由本脚本算出，输出明暗两版 SVG 到 assets/art/。
 * 徽章挂在 .ef-hud-bg 的背景层（z-index:-1），永远在内容之后。
 *
 *   node tools/build-emblem.mjs
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'assets', 'art')

/** 极坐标 → 直角坐标（角度以正上方为 0°，顺时针）。 */
const pt = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}
const n = (v) => Math.round(v * 100) / 100

function emblem(theme) {
  const ink = theme === 'dark' ? '#E6E6E6' : '#191919'
  const accent = theme === 'dark' ? '#FFFA00' : '#B8A800'
  const cx = 200
  const cy = 200
  const parts = []

  // 外环：四段弧，四角留口（HUD 常见断环）
  const gap = 6
  for (const start of [0, 90, 180, 270]) {
    const [x1, y1] = pt(cx, cy, 168, start + gap)
    const [x2, y2] = pt(cx, cy, 168, start + 90 - gap)
    parts.push('<path d="M' + n(x1) + ' ' + n(y1) + 'A168 168 0 0 1 ' + n(x2) + ' ' + n(y2) + '" fill="none"/>')
  }

  // 刻度环：36 根刻度，每 9 根加长，每 90° 一根强调色
  for (let i = 0; i < 36; i++) {
    const deg = i * 10
    const long = i % 9 === 0
    const [x1, y1] = pt(cx, cy, 178, deg)
    const [x2, y2] = pt(cx, cy, long ? 196 : 188, deg)
    const stroke = i % 9 === 0 ? ' class="accent"' : ''
    parts.push('<path d="M' + n(x1) + ' ' + n(y1) + 'L' + n(x2) + ' ' + n(y2) + '"' + stroke + '/>')
  }

  // 内环（虚线）
  parts.push('<circle cx="200" cy="200" r="132" fill="none" stroke-dasharray="3 9"/>')

  // 菱形（旋转 45° 的方框）
  const half = 104
  parts.push('<rect x="' + (cx - half) + '" y="' + (cy - half) + '" width="' + half * 2 + '" height="' + half * 2 + '" fill="none" transform="rotate(45 200 200)" stroke-dasharray="40 6 120 6"/>')

  // 准星：横竖各两段，中间留口
  parts.push('<path d="M40 200H176M224 200H360M200 40V176M200 224V360" fill="none"/>')
  parts.push('<circle cx="200" cy="200" r="7" fill="none"/>')
  parts.push('<circle cx="200" cy="200" r="2" class="accent-fill"/>')

  // 四角括号
  const b = 26
  const o = 44
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = cx + sx * (half * 1.62)
    const y = cy + sy * (half * 1.62)
    parts.push('<path d="M' + n(x) + ' ' + n(y + sy * b) + 'V' + n(y) + 'H' + n(x + sx * b) + '" fill="none"/>')
  }

  // 三段数据弧（右上、左下、右下）
  for (const [start, len, cls] of [[20, 34, ''], [140, 26, ''], [250, 44, 'accent']]) {
    const [x1, y1] = pt(cx, cy, 152, start)
    const [x2, y2] = pt(cx, cy, 152, start + len)
    parts.push('<path d="M' + n(x1) + ' ' + n(y1) + 'A152 152 0 0 1 ' + n(x2) + ' ' + n(y2) + '" fill="none" class="' + cls + '"/>')
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">'
    + '<style>'
    + 'path,circle,rect{stroke:' + ink + ';stroke-width:1;vector-effect:non-scaling-stroke;opacity:' + (theme === 'dark' ? '.36' : '.26') + '}'
    + '.accent{stroke:' + accent + '}.accent-fill{fill:' + accent + ';stroke:none;opacity:.55}'
    + '</style>'
    + parts.join('') + '</svg>'
}

mkdirSync(OUT, { recursive: true })
for (const theme of ['dark', 'light']) {
  const file = join(OUT, 'hud-emblem-' + theme + '.svg')
  writeFileSync(file, emblem(theme), 'utf8')
  console.log('  ✓ hud-emblem-' + theme + '.svg  ' + (statSync(file).size / 1024).toFixed(1) + ' KB')
}
console.log('\n完成 → assets/art/')
