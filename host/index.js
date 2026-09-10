/**
 * Endfield HUD · host half
 *
 * 零运行时依赖（只用 node: 内置模块）：负责三件事
 *   1. 首屏防闪屏 —— tapIndex 在每份送达的 index.html 上盖 html[data-ef-hud="on"]
 *      并插入皮肤样式表与字体预加载，刷新即以终末地皮肤启动（无 FOUC）。
 *   2. 同源资产 —— /plugins/endfield-hud/assets/* 提供 skin.css 与字体文件。
 *   3. 状态持久化 —— ~/.dsh/endfield-hud.json（GET /state、POST /set）。
 *
 * 浏览器半区（./client）负责实时开关、装饰层与设置卡。
 * @module dsh-client-ui-endfield-hud
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createReadStream } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Stable cordis plugin name (must match cordis.patch.yml insert id). */
export const name = 'endfield-hud'

/** Required service: the browser HTTP carrier. */
export const inject = ['webServer']

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS_ROOT = join(PKG_ROOT, 'assets')
const ASSET_PREFIX = '/plugins/endfield-hud/assets'
const API_PREFIX = '/api/endfield-hud'

/** Skin state defaults; every field is clamped on read. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  opacity: 100,
  decorations: true,
  parallax: 1,
  edge: 1,
  bgOpacity: 100,
  fisheye: 0,
})

const BOUNDS = Object.freeze({
  opacity: [0, 100],
  parallax: [0, 10],
  edge: [0, 3],
  bgOpacity: [0, 100],
  fisheye: [0, 100],
})

const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
})

/** Font files preloaded on first paint (subset of assets/fonts). */
const PRELOAD_FONTS = Object.freeze([
  'NovecentoWide-Bold.woff2',
  'Gilroy-Medium.woff2',
  'ProtestStrike-Regular.woff2',
])

/** Absolute path of the persisted state file ($DSH_HOME/endfield-hud.json). */
export function stateFile(env = process.env) {
  const home = env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'endfield-hud.json')
}

/** Clamp one numeric field into its declared bounds. */
function clampNumber(value, [min, max], fallback) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Normalize an arbitrary object into a valid state (unknown keys dropped). */
export function normalizeState(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const out = { ...DEFAULTS }
  if (typeof source.enabled === 'boolean') out.enabled = source.enabled
  if (typeof source.decorations === 'boolean') out.decorations = source.decorations
  out.opacity = clampNumber(source.opacity, BOUNDS.opacity, DEFAULTS.opacity)
  out.parallax = clampNumber(source.parallax, BOUNDS.parallax, DEFAULTS.parallax)
  // edge 是「边缘效果」强度；旧版本叫 noise（边缘噪点），读旧值做一次迁移
  out.edge = clampNumber(source.edge ?? source.noise, BOUNDS.edge, DEFAULTS.edge)
  out.bgOpacity = clampNumber(source.bgOpacity, BOUNDS.bgOpacity, DEFAULTS.bgOpacity)
  out.fisheye = clampNumber(source.fisheye, BOUNDS.fisheye, DEFAULTS.fisheye)
  return out
}

/** Read the persisted state; a missing or corrupt file resolves to defaults. */
export function loadState(env = process.env) {
  const file = stateFile(env)
  try {
    if (!existsSync(file)) return { ...DEFAULTS }
    return normalizeState(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

/** Persist the state; write failures are reported to the caller, never thrown silently. */
export function saveState(state, env = process.env) {
  const file = stateFile(env)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8')
  return file
}

/**
 * Pure index.html transform: stamp the scope attribute and inject the
 * stylesheet + font preloads + the opacity variable. Idempotent: an already
 * stamped document is returned untouched.
 * @param html - raw document served by the shell.
 * @param state - resolved skin state.
 * @returns the transformed document.
 */
export function applyHtml(html, state) {
  if (!state.enabled) return html
  if (typeof html !== 'string' || html.length === 0) return html
  if (html.includes('data-ef-hud')) return html
  const head = [
    '<link rel="stylesheet" href="' + ASSET_PREFIX + '/skin.css">',
    ...PRELOAD_FONTS.map((f) => '<link rel="preload" as="font" type="font/woff2" crossorigin href="' + ASSET_PREFIX + '/fonts/' + f + '">'),
    '<style>:root{--ef-panel-opacity:' + (state.opacity / 100) + '}</style>',
  ].join('')
  return html
    .replace(/<html(\s|>)/i, (match, tail) => '<html data-ef-hud="on"' + tail)
    .replace(/<\/head>/i, head + '</head>')
}

/**
 * Pure asset resolver: map a request pathname onto a file inside assets/.
 * Path escapes, unknown extensions and directories resolve to null.
 * @param pathname - request pathname (may carry a query-free path).
 * @returns absolute file path or null.
 */
export function resolveAssetPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith(ASSET_PREFIX)) return null
  let rel = pathname.slice(ASSET_PREFIX.length)
  if (rel === '' || rel === '/') rel = '/skin.css'
  let decoded
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const abs = resolve(ASSETS_ROOT, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded))
  if (abs !== ASSETS_ROOT && !abs.startsWith(ASSETS_ROOT + sep)) return null
  if (!Object.hasOwn(MIME, extname(abs).toLowerCase())) return null
  return abs
}

/** Same-origin fence for mutating endpoints (cross-site writes are refused). */
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin.length === 0) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(text)
}

function readBody(req, limit = 16384) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        rejectBody(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolveBody(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', rejectBody)
  })
}

function serveAsset(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  const file = resolveAssetPath(pathname)
  if (file === null || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('endfield-hud: asset not found')
    return
  }
  const stat = statSync(file)
  if (!stat.isFile()) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()],
    'content-length': stat.size,
    'cache-control': 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

/**
 * Mount the host half: asset + state routes and the index transform.
 * @param ctx - host context (requires the webServer service).
 */
export function apply(ctx) {
  const state = loadState()
  const current = () => state

  const routes = [
    {
      kind: 'exact',
      path: API_PREFIX + '/state',
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' })
          res.end()
          return
        }
        sendJson(res, 200, { ok: true, ...current() })
      },
    },
    {
      kind: 'exact',
      path: API_PREFIX + '/set',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        if (!sameOrigin(req)) {
          sendJson(res, 403, { ok: false, error: 'cross-site-write-refused' })
          return
        }
        let patch
        try {
          const text = await readBody(req)
          patch = text.length === 0 ? {} : JSON.parse(text)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: 'bad-json', detail: String(error && error.message) })
          return
        }
        const next = normalizeState({ ...current(), ...(patch !== null && typeof patch === 'object' ? patch : {}) })
        for (const key of Object.keys(next)) state[key] = next[key]
        let persisted = true
        try {
          saveState(state)
        } catch {
          persisted = false
        }
        sendJson(res, 200, { ok: true, persisted, ...current() })
      },
    },
    {
      kind: 'prefix',
      path: ASSET_PREFIX,
      handler: (req, res) => {
        const pathname = (req.url || '').split('?')[0]
        serveAsset(req, res, pathname)
      },
    },
  ]

  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route))
    const untap = ctx.webServer.tapIndex((html) => applyHtml(html, current()))
    return () => {
      untap()
      for (const dispose of disposers) dispose()
    }
  }, 'endfield-hud: routes + index tap')
}
