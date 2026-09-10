#!/usr/bin/env node
/**
 * selftest.mjs — 无需安装、无需 DSH 进程的离线自检。
 * 用假的 ctx / req / res / DOM 跑通 host 半区与 client 半区，
 * 覆盖：首屏盖章与注入、资产路由与路径逃逸、状态读写与跨站拒绝、
 *      客户端 apply 的 DOM 投影与设置卡注册。
 *
 * 用法：node tools/selftest.mjs
 */
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'

let pass = 0
let fail = 0
function check(name, condition, detail) {
  if (condition) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fail++
    console.log('  ✗ ' + name + (detail === undefined ? '' : '  → ' + detail))
  }
}

/* ---------------- host half ---------------- */
const HOME = mkdtempSync(join(tmpdir(), 'ef-hud-test-'))
process.env.DSH_HOME = HOME

const host = await import(pathToFileURL(new URL('../host/index.js', import.meta.url).pathname.slice(1)).href)

class FakeRes extends Writable {
  constructor() {
    super()
    this.chunks = []
    this.status = null
    this.headers = null
  }
  writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; return this }
  _write(chunk, _enc, cb) { this.chunks.push(Buffer.from(chunk)); cb() }
  end(data) { if (data !== undefined) this.chunks.push(Buffer.from(data)); super.end() }
  get body() { return Buffer.concat(this.chunks).toString('utf8') }
}

function fakeReq(method, url, headers = {}, body) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  if (body !== undefined) {
    process.nextTick(() => { req.emit('data', Buffer.from(body)); req.emit('end') })
  }
  return req
}

async function callRoute(route, req) {
  const res = new FakeRes()
  await route.handler(req, res)
  await new Promise((r) => (res.writableFinished ? r() : res.on('finish', r)))
  return res
}

console.log('\n[host] 纯函数')
check('normalizeState 夹取边界并把旧 noise 迁移为 edge', (() => {
  const s = host.normalizeState({ enabled: false, opacity: 999, parallax: -5, noise: 2, bogus: 1 })
  const s2 = host.normalizeState({ parallax: 9, edge: 3, bgOpacity: 40, fisheye: 55 })
  const s3 = host.normalizeState({ parallax: 99, bgOpacity: 999, fisheye: -5 })
  return s.enabled === false && s.opacity === 100 && s.parallax === 0 && s.edge === 2 && s.bogus === undefined
    && s2.parallax === 9 && s2.edge === 3 && s2.bgOpacity === 40 && s2.fisheye === 55
    && s3.parallax === 10 && s3.bgOpacity === 100 && s3.fisheye === 0
})())
check('applyHtml 盖章 + 注入样式表 + 字体预加载', (() => {
  const html = '<!doctype html><html lang="zh"><head><meta charset="utf-8"></head><body></body></html>'
  const out = host.applyHtml(html, host.DEFAULTS)
  return out.includes('<html data-ef-hud="on" lang="zh">')
    && out.includes('/plugins/endfield-hud/assets/skin.css')
    && out.includes('NovecentoWide-Bold.woff2')
    && out.indexOf('skin.css') < out.indexOf('</head>')
})())
check('applyHtml 幂等（已盖章的文档原样返回）', (() => {
  const html = '<html data-ef-hud="on"><head></head></html>'
  return host.applyHtml(html, host.DEFAULTS) === html
})())
check('applyHtml 关闭时不动文档', (() => {
  const html = '<html><head></head></html>'
  return host.applyHtml(html, { ...host.DEFAULTS, enabled: false }) === html
})())
check('resolveAssetPath 命中 skin.css', host.resolveAssetPath('/plugins/endfield-hud/assets/skin.css')?.endsWith('skin.css') === true)
check('resolveAssetPath 命中字体', host.resolveAssetPath('/plugins/endfield-hud/assets/fonts/Gilroy-Medium.woff2')?.endsWith('Gilroy-Medium.woff2') === true)
check('resolveAssetPath 拒绝路径逃逸', host.resolveAssetPath('/plugins/endfield-hud/assets/../../package.json') === null)
check('resolveAssetPath 拒绝未知扩展名', host.resolveAssetPath('/plugins/endfield-hud/assets/skin.exe') === null)
check('resolveAssetPath 拒绝空/非法编码', host.resolveAssetPath('/plugins/endfield-hud/assets/%') === null)

console.log('\n[host] apply(ctx) 装配')
let routes = []
let taps = []
const ctx = {
  effect(fn) { return fn() },
  webServer: {
    register(route) { routes.push(route); return () => { routes = routes.filter((r) => r !== route) } },
    tapIndex(fn) { taps.push(fn); return () => { taps = taps.filter((f) => f !== fn) } },
  },
}
host.apply(ctx)
check('注册了 3 条路由', routes.length === 3, routes.map((r) => r.kind + ' ' + r.path).join(', '))
check('注册了 index 变换', taps.length === 1)

const byPath = (p) => routes.find((r) => r.path === p)

console.log('\n[host] HTTP 行为')
const stateRes = await callRoute(byPath('/api/endfield-hud/state'), fakeReq('GET', '/api/endfield-hud/state'))
check('GET /state 返回 200 + JSON', stateRes.status === 200 && JSON.parse(stateRes.body).enabled === true, stateRes.status + ' ' + stateRes.body.slice(0, 80))

const cssRes = await callRoute(byPath('/plugins/endfield-hud/assets'), fakeReq('GET', '/plugins/endfield-hud/assets/skin.css'))
check('GET skin.css 返回 200 + text/css', cssRes.status === 200 && String(cssRes.headers['content-type']).startsWith('text/css'), String(cssRes.headers['content-type']))
check('skin.css 含 token 重映射', cssRes.body.includes('--dsw-alias-brand-primary: #FFFA00'))
check('skin.css 含字体声明', cssRes.body.includes("@font-face"))

const fontRes = await callRoute(byPath('/plugins/endfield-hud/assets'), fakeReq('GET', '/plugins/endfield-hud/assets/fonts/Gilroy-Medium.woff2'))
check('GET 字体返回 200 + font/woff2', fontRes.status === 200 && fontRes.headers['content-type'] === 'font/woff2')

const escapeRes = await callRoute(byPath('/plugins/endfield-hud/assets'), fakeReq('GET', '/plugins/endfield-hud/assets/../../package.json'))
check('路径逃逸返回 404', escapeRes.status === 404)

const crossRes = await callRoute(byPath('/api/endfield-hud/set'), fakeReq('POST', '/api/endfield-hud/set', { origin: 'http://evil.example', host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }, '{"enabled":false}'))
check('跨站写入被拒（403）', crossRes.status === 403, crossRes.body.slice(0, 80))

const setRes = await callRoute(byPath('/api/endfield-hud/set'), fakeReq('POST', '/api/endfield-hud/set', { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }, '{"enabled":false,"opacity":42}'))
const setBody = JSON.parse(setRes.body)
check('同源写入成功并回读', setRes.status === 200 && setBody.enabled === false && setBody.opacity === 42, setRes.body)
check('状态已落盘', existsSync(join(HOME, 'endfield-hud.json')) && JSON.parse(readFileSync(join(HOME, 'endfield-hud.json'), 'utf8')).opacity === 42)
check('落盘后 loadState 一致', host.loadState().opacity === 42)

const badRes = await callRoute(byPath('/api/endfield-hud/set'), fakeReq('POST', '/api/endfield-hud/set', { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' }, '{oops'))
check('坏 JSON 返回 400', badRes.status === 400)

/* ---------------- client half ---------------- */
console.log('\n[client] 模块加载器 + DOM 投影')
const el = (tag) => {
  const node = {
    tagName: String(tag).toUpperCase(), className: '', id: '', textContent: '', innerHTML: '',
    dataset: {}, style: { setProperty() {}, }, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v },
    append(...kids) { for (const k of kids) this.children.push(k) },
    appendChild(k) { this.children.push(k); return k },
    remove() { if (this.parent !== undefined) this.parent.children = this.parent.children.filter((c) => c !== this) },
    matches() { return false },
    querySelector() { return null },
    querySelectorAll() { return [] },
    getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 } },
  }
  return node
}
const registry = { styles: [], links: [], decos: [] }
const head = el('head'); const body = el('body')
head.appendChild = (k) => { head.children.push(k); if (k.tagName === 'STYLE') registry.styles.push(k); if (k.tagName === 'LINK') registry.links.push(k); k.parent = head; return k }
body.appendChild = (k) => { body.children.push(k); if (String(k.className).includes('ef-hud-deco')) registry.decos.push(k); k.parent = body; return k }
const htmlEl = el('html')
const doc = {
  head, body, documentElement: htmlEl,
  createElement: el,
  getElementById: (id) => [...head.children, ...body.children].find((c) => c.id === id) ?? null,
  querySelectorAll: () => [],
  createElementNS: null,
  querySelector: (sel) => {
    if (!sel.startsWith('.')) return null
    const want = sel.slice(1).split(' ')[0]
    const all = [...head.children, ...body.children]
    const hit = all.find((c) => String(c.className).split(' ').includes(want))
    return hit ?? null
  },
}
globalThis.document = doc
globalThis.window = globalThis
let loaded = null
globalThis.__ModuleLoader__ = { load(spec) { loaded = spec } }
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/state')) return { ok: true, status: 200, json: async () => ({ ok: true, enabled: true, opacity: 100, decorations: true, parallax: 1, edge: 1 }) }
  return { ok: true, status: 200, json: async () => ({ ok: true, ...JSON.parse(init.body) }) }
}
const reactStub = {
  createElement: (type, props, ...kids) => ({ type, props: props ?? {}, kids }),
  useSyncExternalStore: (_sub, get) => get(),
}
const requireStub = (id) => {
  if (id === 'react') return reactStub
  throw new Error('unexpected require: ' + id)
}

await import(pathToFileURL(new URL('../client/index.js', import.meta.url).pathname.slice(1)).href)
check('客户端以 __ModuleLoader__.load 注册', loaded !== null && loaded.id === 'dsh-client-ui-endfield-hud')
const exportsObj = loaded.factory(requireStub)
check('导出 inject = ["slots"]', Array.isArray(exportsObj.inject) && exportsObj.inject.includes('slots'))
check('导出 apply 函数', typeof exportsObj.apply === 'function')

const registered = []
const clientCtx = {
  effect(fn) { return fn() },
  slots: {
    inject(name, fn) { return fn() },
    register(options, component) { registered.push({ options, component }); return () => {} },
  },
}
exportsObj.apply(clientCtx)
check('注册了 settings.section 卡片', registered.length === 1 && registered[0].options.name === 'settings.section' && registered[0].options.id === 'endfield-hud', JSON.stringify(registered.map((r) => r.options.id)))
check('卡片是 React 组件', typeof registered[0].component === 'function')
check('注入插件级样式', registry.styles.length === 1)
check('挂上皮肤样式表 link', registry.links.some((l) => l.href === '/plugins/endfield-hud/assets/skin.css'))
check('创建 HUD 装饰层', registry.decos.length === 1)
check('创建 HUD 徽章/图标 sprite 层', (() => {
  return body.children.some((c) => String(c.id).includes('ef-hud-icon-sprite'))
    || body.children.some((c) => String(c.id).includes('ef-hud-fisheye'))
    || body.children.some((c) => String(c.className).includes('ef-hud-bg'))
})())
check('html 打上 data-ef-hud', htmlEl.dataset.efHud === 'on')
await new Promise((r) => setTimeout(r, 20))
check('fetch 状态回填后仍启用', htmlEl.dataset.efHud === 'on')

rmSync(HOME, { recursive: true, force: true })
console.log('\n' + (fail === 0 ? '全部通过' : '存在失败') + '：' + pass + ' 通过 / ' + fail + ' 失败\n')
process.exit(fail === 0 ? 0 : 1)
