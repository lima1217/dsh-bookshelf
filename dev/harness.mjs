/**
 * Browser test page for the bookshelf, outside DSH: serves the real client.js
 * with a fake module loader, slots, and locale, and mounts the real index.js
 * routes and agent tools. POST /test/tool {name, args} runs a tool the way the
 * agent would, to watch the panel pick up an outside write.
 *
 * Env: PORT (47821), DSH_BOOKSHELF_FILE (a scratch file in the OS temp dir),
 * REACT_UMD_DIR (a node_modules holding react@18 and react-dom@18 UMD builds).
 */
import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
process.env.DSH_BOOKSHELF_FILE = process.env.DSH_BOOKSHELF_FILE || join(tmpdir(), 'dsh-bookshelf-harness.json')
const M = process.env.REACT_UMD_DIR || `${process.env.HOME}/.npm/_npx/1e7f6d9597241db0/node_modules`
if (!existsSync(`${M}/react/umd/react.development.js`)) {
  console.error(`React 18 UMD not found under ${M}; set REACT_UMD_DIR to a node_modules that has react@18 and react-dom@18`)
  process.exit(1)
}
const P = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const plugin = await import(`${P}/index.js`)
console.log('shelf file:', process.env.DSH_BOOKSHELF_FILE)
const routes = {}, tools = {}
const ctx = {
  logger: console,
  effect: fn => fn(),
  webServer: { register: r => { routes[r.path] = r; return () => {} } },
  inject: (deps, cb) => cb({ ...ctx, tools: { register: t => { tools[t.name] = t; return () => {} } } }),
}
plugin.apply(ctx)
const html = `<!doctype html><html><head><meta charset="utf-8"><title>bookshelf harness</title>
<style>:root{--dsw-alias-brand-primary:#3b6ef5;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f7f7f8;--dsw-alias-bg-layer-2:#eeeef0;--dsw-alias-bg-overlay:#fff;--dsw-alias-label-primary:#1b1b1f;--dsw-alias-label-secondary:#6b6b75;--dsw-alias-border-l1:#e4e4e8;--dsw-alias-border-l2:#d2d2d8;--dsw-alias-state-success-primary:#1f9d55;--dsw-alias-state-warn-primary:#c27a00;--dsw-alias-state-error-primary:#d33;--dsw-alias-state-idle-primary:#8a8a95}
html,body,#root{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif}</style>
<script src="/mod/react/umd/react.development.js"></script>
<script src="/mod/react-dom/umd/react-dom.development.js"></script>
<script>
const dicts = {}
let Page = null, pageProps = null
window.__ModuleLoader__ = { load({ factory }) {
  const plugin = factory(name => { if (name === 'react') return React; throw new Error('no module ' + name) })
  const locale = {
    register(ns, d) { dicts[ns] = d; return () => {} },
    bind(ns) { return (key, params) => { let s = (dicts[ns] && dicts[ns].zh[key]) || key; for (const k in (params || {})) s = s.split('{' + k + '}').join(params[k]); return s } },
    subscribe() { return () => {} },
    getSnapshot() { return SNAP },
  }
  const SNAP = { active: 'zh-CN' }
  plugin.apply({
    effect(fn) { fn() },
    locale,
    slots: { inject(name, fn) { return fn() }, register(meta, C) { if (meta.name === 'main') { Page = C; pageProps = meta.inject() } return () => {} } },
  })
} }
</script>
<script src="/client.js"></script>
</head><body><div id="root"></div>
<script>ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Page, pageProps))</script>
</body></html>`
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html) }
    if (url.pathname === '/client.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(readFileSync(`${P}/client.js`)) }
    if (url.pathname.startsWith('/mod/')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(`${M}/${url.pathname.slice(5)}`)) }
    if (routes[url.pathname]) return routes[url.pathname].handler(req, res)
    if (url.pathname === '/test/tool') {
      let body = ''; for await (const c of req) body += c
      const { name, args } = JSON.parse(body)
      const out = await tools[name].execute(args, {})
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(tools[name].output.render(args, out)[0].text)
    }
    res.writeHead(404); res.end('nope')
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)) }
}).listen(Number(process.env.PORT || 47821), '127.0.0.1', () => console.log('harness on', process.env.PORT || 47821))
