#!/usr/bin/env node
/**
 * preview-proxy.mjs — 在不动用户 GUI、不启动第二个 dsh 实例的前提下预览皮肤。
 *
 * 做法：本地 127.0.0.1:3099 反向代理到正在运行的 dsh web（默认 3080），
 * 只对 index.html 应用 host 半区的 applyHtml()，并自己提供
 * /plugins/endfield-hud/assets/* —— 于是浏览器里看到的就是"装了插件之后的界面"。
 *
 * 用法：node tools/preview-proxy.mjs [--port 3099] [--target 127.0.0.1:3080]
 */
import { createServer, request as httpRequest } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}
const PORT = Number(arg('port', '3099'))
const TARGET = arg('target', '127.0.0.1:3080')
const [TARGET_HOST, TARGET_PORT] = [TARGET.split(':')[0], Number(TARGET.split(':')[1] ?? '3080')]

const host = await import(pathToFileURL(new URL('../host/index.js', import.meta.url).pathname.slice(1)).href)
const STATE = { ...host.DEFAULTS }

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp',
}

function proxy(req, res, body) {
  const upstream = httpRequest({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: TARGET },
  }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers)
    up.pipe(res)
  })
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('preview-proxy upstream error: ' + error.message)
  })
  if (body !== undefined) upstream.end(body)
  else req.pipe(upstream)
}

const server = createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0]

  if (pathname.startsWith('/plugins/endfield-hud/assets')) {
    const file = host.resolveAssetPath(pathname)
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
    createReadStream(file).pipe(res)
    return
  }

  if (pathname === '/' || pathname === '/index.html') {
    const upstream = httpRequest({ host: TARGET_HOST, port: TARGET_PORT, method: 'GET', path: '/', headers: { ...req.headers, host: TARGET } }, (up) => {
      const chunks = []
      up.on('data', (c) => chunks.push(c))
      up.on('end', () => {
        const html = host.applyHtml(Buffer.concat(chunks).toString('utf8'), STATE)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(html)
      })
    })
    upstream.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('preview-proxy upstream error: ' + error.message)
    })
    upstream.end()
    return
  }

  proxy(req, res)
})

server.on('upgrade', (req, socket, head) => {
  const upstream = httpRequest({ host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: TARGET } })
  upstream.on('upgrade', (up, upSocket, upHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(up.headers).map(([k, v]) => k + ': ' + v).join('\r\n') + '\r\n\r\n')
    if (upHead?.length) socket.write(upHead)
    upSocket.pipe(socket)
    socket.pipe(upSocket)
  })
  upstream.on('error', () => socket.destroy())
  upstream.end(head)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('preview-proxy listening http://127.0.0.1:' + PORT + '  →  ' + TARGET)
})
