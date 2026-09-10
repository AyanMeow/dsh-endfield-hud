#!/usr/bin/env node
/**
 * build-fisheye.mjs — 生成背景层的鱼眼位移贴图
 *
 * feDisplacementMap 用 R 通道做 X 位移、G 通道做 Y 位移。这里按桶形畸变算一张
 * 径向位移场：越靠外、向外推得越多（中心被"拱起"，形成鱼眼）。
 *
 *   node tools/build-fisheye.mjs
 * 依赖 sharp（EF_SHARP_PATH）。
 */
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'assets', 'art')

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

const SIZE = 512
const data = Buffer.alloc(SIZE * SIZE * 4)
/** 桶形（鱼眼）位移场：径向越外推得越远，中心轻微收缩。 */
const CURVE = 1.6   // 指数：越大越"拱"
const GAIN = 0.62   // 位移量占半幅的比例

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const nx = (x / (SIZE - 1)) * 2 - 1
    const ny = (y / (SIZE - 1)) * 2 - 1
    const r = Math.min(1, Math.sqrt(nx * nx + ny * ny))
    const push = Math.pow(r, CURVE) * GAIN
    const dx = nx * push
    const dy = ny * push
    const i = (y * SIZE + x) * 4
    data[i] = Math.round(128 + dx * 127)      // R → X 位移
    data[i + 1] = Math.round(128 + dy * 127)  // G → Y 位移
    data[i + 2] = 128
    data[i + 3] = 255
  }
}

mkdirSync(OUT, { recursive: true })
const file = join(OUT, 'fisheye-map.png')
await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(file)
console.log('  ✓ fisheye-map.png  ' + (statSync(file).size / 1024).toFixed(1) + ' KB  ' + SIZE + 'x' + SIZE)
