#!/usr/bin/env node
/**
 * build-deco-assets.mjs — 生成三组新的装饰资产
 *
 *   1. deco-rt-{dark,light}.webp 官网右下装饰线（alpha 极低，需要提亮）
 *   2. tape-v-{dark,light}.webp  条带纹理左旋 90°（侧栏背景）
 *
 * 两者都以 alpha 为形状、按主题染色（暗色画浅线、亮色画深线），
 * 因为原图是给浅色底设计的深色线稿，直接放深色界面里看不见。
 *
 * 右下角塔身不走这里：直接用原图 assets/art/tower-{top,bottom}.png（CSS 两层铺），
 * 不染色、不缩放、不需要 sharp。
 *
 *   node tools/build-deco-assets.mjs
 * 依赖 sharp（EF_SHARP_PATH）。
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, '_refs', 'img')
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

const find = (kw) => {
  const f = readdirSync(SRC).find((n) => n.includes(kw))
  if (f === undefined) { console.log('  ✗ 未找到源图：' + kw); return null }
  return join(SRC, f)
}

/** 以 alpha 为形状染色（可顺带旋转、缩放、整体提亮）。 */
async function tint(srcPath, color, alphaScale, dest, opts = {}) {
  let pipe = sharp(srcPath)
  if (opts.rotate !== undefined) pipe = pipe.rotate(opts.rotate)
  if (opts.width !== undefined) pipe = pipe.resize({ width: opts.width, withoutEnlargement: true })
  if (opts.stacked !== undefined) {
    const top = await sharp(opts.stacked[0]).ensureAlpha().png().toBuffer()
    const bot = await sharp(opts.stacked[1]).ensureAlpha().png().toBuffer()
    const mt = await sharp(top).metadata()
    const mb = await sharp(bot).metadata()
    const canvas = await sharp({
      create: { width: Math.max(mt.width, mb.width), height: mt.height + mb.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: top, top: 1, left: 0 }, { input: bot, top: mt.height, left: 0 }]).png().toBuffer()
    pipe = sharp(canvas)
    if (opts.width !== undefined) pipe = pipe.resize({ width: opts.width, withoutEnlargement: true })
  }
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) {
    out[i * 4] = color[0]
    out[i * 4 + 1] = color[1]
    out[i * 4 + 2] = color[2]
    out[i * 4 + 3] = Math.min(255, Math.round(data[i * 4 + 3] * alphaScale))
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 86, alphaQuality: 95, effort: 5 })
    .toFile(dest)
  return { w: info.width, h: info.height, kb: statSync(dest).size / 1024 }
}

mkdirSync(OUT, { recursive: true })
const DARK = [230, 230, 230]
const LIGHT = [25, 25, 25]

const decoRt = find('subpage-deco-rt')
const tapeWave = find('tape-wave-bg')

const jobs = [
  ['deco-rt-dark.webp', decoRt, DARK, 7, { width: 460 }],
  ['deco-rt-light.webp', decoRt, LIGHT, 7, { width: 460 }],
  ['tape-v-dark.webp', tapeWave, DARK, 1.6, { rotate: -90 }],
  ['tape-v-light.webp', tapeWave, LIGHT, 1.6, { rotate: -90 }],
]

for (const [out, src, color, scale, opts] of jobs) {
  if (src === null) continue
  const r = await tint(src, color, scale, join(OUT, out), opts)
  console.log('  ✓ ' + out.padEnd(22) + r.kb.toFixed(1).padStart(6) + ' KB  ' + r.w + 'x' + r.h)
}
console.log('\n完成 → assets/art/')
