#!/usr/bin/env node
/**
 * fetch-refs.mjs — M0 参考素材抓取器（**仅供本机开发参考，产物一律落在 _refs/，永不进仓库**）
 *
 * 为什么用 Node 而不是 PowerShell：本机沙箱里 Windows schannel 拿不到凭据，
 * Invoke-WebRequest / curl 的 HTTPS 全部失败（SEC_E_NO_CREDENTIALS）；
 * Node 自带 TLS 栈，实测可正常出网。
 *
 * 用法：
 *   node tools/fetch-refs.mjs                  # 抓官网 CSS + 字体 + 图片
 *   node tools/fetch-refs.mjs --pages 10 --max 200
 *   node tools/fetch-refs.mjs --only fonts     # fonts | css | img | gui
 *
 * 产物：
 *   _refs/css/     官网样式表（取色、版式、间距的第一手依据）
 *   _refs/fonts/   官网 @font-face 字体文件（woff2/woff/ttf）
 *   _refs/img/     官网图片资源
 *   _refs/gui/     DSH Web GUI 布局参考截图（来自公开仓库 dsh-web 文档）
 *   _refs/manifest.json  抓取清单（url / 本地路径 / 字节数 / 状态）
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT = resolve(HERE, '..')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SEEDS = [
  'https://endfield.hypergryph.com/',
  // 服务端渲染的干员页，带着比首页大得多的人物立绘（首页那份是 120x120 小图）
  'https://endfield.hypergryph.com/operator',
  // 公告页（另一批 upload 图）
  'https://endfield.hypergryph.com/news',
]
/** 公开仓库里 DSH Web GUI 的界面截图：布局参考用（不是终末地素材）。 */
const GUI_SEEDS = [
  'https://raw.githubusercontent.com/zhu1090093659/dsh-web/dev/docs/screenshots/13-hero-main.png',
  'https://raw.githubusercontent.com/zhu1090093659/dsh-web/dev/docs/screenshots/09-task-board.png',
  'https://raw.githubusercontent.com/zhu1090093659/dsh-web/dev/docs/screenshots/17-skin-blue-fantasy-dark.png',
  'https://raw.githubusercontent.com/zhu1090093659/dsh-web/dev/docs/screenshots/10-task-board-detail-cron.png',
]
const MAX_FILE_BYTES = 15 * 1024 * 1024

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const OUT = resolve(PROJECT, flag('out', '_refs'))
const MAX_PAGES = Number(flag('pages', '8'))
const MAX_FILES = Number(flag('max', '160'))
const ONLY = flag('only', 'all')
const CONCURRENCY = 4

const log = (...a) => console.log(...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const abs = (u, base = 'https://endfield.hypergryph.com') => {
  if (!u) return null
  if (u.startsWith('data:')) return null
  if (u.startsWith('//')) return 'https:' + u
  if (/^https?:\/\//.test(u)) return u
  if (u.startsWith('/')) return base + u
  return base + '/' + u
}
const clean = u => abs(u)?.split('#')[0] ?? null
const shortHash = s => createHash('sha1').update(s).digest('hex').slice(0, 8)
const safeName = u => {
  const path = new URL(u).pathname
  const base = decodeURIComponent(path.split('/').pop() || 'index')
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

const manifest = { generatedAt: new Date().toISOString(), out: OUT, entries: [], skipped: [] }
const seen = new Set()

async function fetchBuf(url, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 25_000)
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://endfield.hypergryph.com/' }, signal: ctl.signal, redirect: 'follow' })
      clearTimeout(timer)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === retries) throw err
      await sleep(400 * (attempt + 1))
    }
  }
}
const fetchText = async url => (await fetchBuf(url)).toString('utf8')

async function save(subdir, url, buf, extra = {}) {
  if (!url || seen.has(url)) return null
  seen.add(url)
  if (buf.length > MAX_FILE_BYTES) {
    manifest.skipped.push({ url, reason: 'too-large', bytes: buf.length })
    return null
  }
  const file = join(OUT, subdir, shortHash(url) + '-' + safeName(url))
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, buf)
  const entry = { url, file: file.replace(PROJECT + '\\', '').replace(PROJECT + '/', ''), bytes: buf.length, ...extra }
  manifest.entries.push(entry)
  log('  + ' + entry.file + '  (' + (buf.length / 1024).toFixed(1) + ' KB)')
  return entry
}

const isFont = u => /\.(woff2?|ttf|otf)(\?|$)/i.test(u)
const isImg = u => /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(u)
const isCss = u => /\.css(\?|$)/i.test(u)
const isVideo = u => /\.(mp4|webm|m3u8)(\?|$)/i.test(u)

function extractUrls(text) {
  const out = new Set()
  for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) out.add(clean(m[1]))
  for (const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) out.add(clean(m[1]))
  for (const m of text.matchAll(/https?:\/\/[^"'\s\\)]+/g)) out.add(clean(m[0]))
  out.delete(null)
  return [...out]
}

async function pool(items, worker) {
  const queue = [...items]
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      try { await worker(item) } catch (err) { manifest.skipped.push({ url: String(item), reason: String(err.message).slice(0, 160) }) }
      await sleep(120)
    }
  })
  await Promise.all(runners)
}

// ---- 1. 页面发现 ------------------------------------------------------------
async function crawlPages() {
  const pages = []
  for (const seed of SEEDS) {
    const html = await fetchText(seed)
    pages.push({ url: seed, html })
    for (const m of html.matchAll(/href\s*=\s*["'](\/[^"'#?]*)["']/g)) {
      const u = clean(m[1], seed)
      if (u && !pages.some(p => p.url === u)) pages.push({ url: u, html: null })
    }
  }
  const limited = pages.slice(0, MAX_PAGES)
  log('页面发现: ' + limited.length + ' 个（含首页）')
  for (const page of limited) {
    if (page.html) continue
    try { page.html = await fetchText(page.url) } catch { page.html = '' }
    await sleep(150)
  }
  return limited.filter(p => p.html)
}

// ---- 2. 主流程 --------------------------------------------------------------
async function main() {
  await mkdir(OUT, { recursive: true })
  log('输出目录: ' + OUT)

  if (ONLY === 'gui' || ONLY === 'all') {
    log('\n[gui] DSH 界面布局参考截图')
    for (const url of GUI_SEEDS) {
      try { await save('gui', url, await fetchBuf(url)) } catch (err) { manifest.skipped.push({ url, reason: err.message }) }
      await sleep(150)
    }
  }

  if (ONLY !== 'gui') {
    log('\n[pages] 抓取官网页面')
    const pages = await crawlPages()

    log('\n[css] 样式表')
    const cssUrls = [...new Set(pages.flatMap(p => extractUrls(p.html)).filter(isCss))]
    for (const url of cssUrls) {
      try { await save('css', url, await fetchBuf(url)) } catch (err) { manifest.skipped.push({ url, reason: err.message }) }
      await sleep(150)
    }

    // 从已抓到的 CSS 里再挖字体 / 图片
    const { readFile, readdir } = await import('node:fs/promises')
    const cssDir = join(OUT, 'css')
    const cssFiles = await readdir(cssDir).catch(() => [])
    let cssText = ''
    for (const f of cssFiles) cssText += await readFile(join(cssDir, f), 'utf8')
    const fromCss = extractUrls(cssText)
    const pageUrls = [...new Set(pages.flatMap(p => extractUrls(p.html)))]

    if (ONLY === 'all' || ONLY === 'fonts') {
      log('\n[fonts] 字体文件')
      const fonts = [...new Set([...fromCss, ...pageUrls].filter(isFont))]
      log('  发现 ' + fonts.length + ' 个字体文件')
      await pool(fonts.slice(0, 80), async url => save('fonts', url, await fetchBuf(url)))
    }

    if (ONLY === 'all' || ONLY === 'img') {
      log('\n[img] 图片资源')
      const imgs = [...new Set([...fromCss, ...pageUrls].filter(u => isImg(u) && !u.includes('favicon')))]
      log('  发现 ' + imgs.length + ' 个图片（按体积上限截取前 ' + MAX_FILES + ' 个）')
      await pool(imgs.slice(0, MAX_FILES), async url => save('img', url, await fetchBuf(url)))
      const videos = pageUrls.filter(isVideo)
      if (videos.length) manifest.skipped.push({ url: '(video)', reason: 'video-skipped', count: videos.length })
    }
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  const byDir = {}
  for (const e of manifest.entries) {
    const k = e.file.split('\\')[1] ?? e.file.split('/')[1] ?? '?'
    byDir[k] = byDir[k] ?? { files: 0, mb: 0 }
    byDir[k].files++
    byDir[k].mb += e.bytes / 1048576
  }
  log('\n===== 抓取完成 =====')
  for (const [k, v] of Object.entries(byDir)) log('  ' + k.padEnd(8) + v.files + ' 个文件  ' + v.mb.toFixed(2) + ' MB')
  log('  跳过/失败: ' + manifest.skipped.length + ' 条（详见 manifest.json）')
}

main().catch(err => { console.error('FATAL', err); process.exit(1) })
