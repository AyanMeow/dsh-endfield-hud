#!/usr/bin/env node
/**
 * build-art.mjs — 把 _refs 里的官方原图压成随包发布的美术层
 *
 * 输入：_refs/img/（抓取下来的原图，名字带哈希前缀，按关键字匹配）
 * 输出：assets/art/（体积可控、格式统一的成品）
 *
 *   node tools/build-art.mjs          # 构建
 *   node tools/build-art.mjs --list   # 只列出匹配到的源文件
 *
 * 依赖 sharp：本机可用 EF_SHARP_PATH 指向已安装的 sharp/dist/index.cjs。
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
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

/** 源文件匹配（关键字 → 取体积最大的那个）。 */
function pick(keyword) {
  const hits = readdirSync(SRC)
    .filter((f) => f.includes(keyword))
    .map((f) => ({ f, kb: statSync(join(SRC, f)).size / 1024 }))
    .sort((a, b) => b.kb - a.kb)
  return hits[0] === undefined ? null : hits[0]
}

/** 构建清单：源关键字 → 输出 + 处理方式。 */
const PLAN = [
  { key: 'kv_v1d5.d', out: 'kv.jpg', width: 1920, format: 'jpeg', quality: 76, note: '主视觉 KV（背景层）' },
  { key: 'tape-wave-bg', out: 'tape.webp', width: 946, format: 'webp', quality: 80, note: 'HUD 条带纹理' },

]

if (process.argv.includes('--list')) {
  for (const p of PLAN) {
    const hit = pick(p.key)
    console.log((hit === null ? '  ✗ ' : '  ✓ ') + p.key.padEnd(28) + (hit === null ? '未找到' : hit.f + '  ' + hit.kb.toFixed(0) + ' KB') + '  →  ' + p.out)
  }
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
let total = 0
for (const p of PLAN) {
  const hit = pick(p.key)
  if (hit === null) { console.log('  ✗ 未找到源图：' + p.key); continue }
  const src = join(SRC, hit.f)
  const dest = join(OUT, p.out)
  let pipe = sharp(src).resize({ width: p.width, withoutEnlargement: true })
  if (p.alpha !== undefined) {
    // 把不透明度直接烘进 alpha 通道：立绘水印不需要 CSS 再调。
    // 先缩放到目标尺寸，再取 alpha（尺寸必须与 joinChannel 的 raw 一致）。
    const resized = await sharp(src).resize({ width: p.width, withoutEnlargement: true }).png().toBuffer()
    const meta = await sharp(resized).metadata()
    // 必须 .raw()：默认 toBuffer 会按 PNG 编码，交给 joinChannel 会尺寸不符
    const alphaBuf = await sharp(resized).ensureAlpha().extractChannel(3).linear(p.alpha, 0).raw().toBuffer()
    pipe = sharp(resized)
      .removeAlpha()
      .joinChannel(alphaBuf, { raw: { width: meta.width, height: meta.height, channels: 1 } })
  }
  if (p.format === 'jpeg') pipe = pipe.jpeg({ quality: p.quality, mozjpeg: true })
  else pipe = pipe.webp({ quality: p.quality, alphaQuality: 90, effort: 5 })
  await pipe.toFile(dest)
  const size = statSync(dest).size
  total += size
  const meta = await sharp(dest).metadata()
  console.log('  ✓ ' + p.out.padEnd(26) + (size / 1024).toFixed(1).padStart(7) + ' KB  ' + meta.width + 'x' + meta.height + '  ' + p.note)
}
console.log('\n美术层合计 ' + (total / 1024).toFixed(1) + ' KB  →  assets/art/')
