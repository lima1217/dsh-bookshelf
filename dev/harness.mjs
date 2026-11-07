/**
 * Browser test page for the bookshelf, outside DSH: serves the real client.js
 * with a fake module loader, slots, and locale, and mounts the real index.js
 * routes and agent tools. POST /test/tool {name, args} runs a tool the way the
 * agent would, to watch the panel pick up an outside write.
 *
 * Query: ?lang=zh (default) | en | pseudo (English stretched by 40% to find
 * truncation), ?theme=light (default) | dark. Theme tokens are the real DSH
 * values (dsh-client-ui-theme), so colors and contrast match the app.
 *
 * Env: PORT (47821), DSH_BOOKSHELF_FILE (a scratch file in the OS temp dir),
 * REACT_UMD_DIR (a node_modules holding react@18 and react-dom@18 UMD builds),
 * BOOKSHELF_CLIENT (serve another client.js, e.g. an old copy for before/after shots).
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
<style>body{--dsw-alias-brand-primary:#0f1115;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#fff;--dsw-alias-bg-overlay:#e9ecf2;--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#81858c;--dsw-alias-border-l1:#0000000a;--dsw-alias-border-l2:#0000001a;--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-warn-primary:#f59e0b;--dsw-alias-state-error-primary:#ec1313;--dsw-alias-state-idle-primary:#d4d4d4;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
body[data-ds-dark-theme]{--dsw-alias-brand-primary:#f9fafb;--dsw-alias-bg-base:#151517;--dsw-alias-bg-layer-1:#232324;--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-bg-overlay:#61666b;--dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#adb2b8;--dsw-alias-border-l1:#ffffff0f;--dsw-alias-border-l2:#ffffff1f;--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-warn-primary:#f59e0b;--dsw-alias-state-error-primary:#f25a5a;--dsw-alias-state-idle-primary:#545557}
html,body,#root{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif}</style>
<script src="/mod/react/umd/react.development.js"></script>
<script src="/mod/react-dom/umd/react-dom.development.js"></script>
<script>
const dicts = {}
const params = new URLSearchParams(location.search)
const LANG = params.get('lang') || 'zh'
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark'
/** Pseudo-locale: English plus 40% filler, so the longest real translation still fits. */
const stretch = s => s + ' ' + '~'.repeat(Math.ceil(s.length * 0.4))
let Page = null, pageProps = null
window.__ModuleLoader__ = { load({ factory }) {
  const plugin = factory(name => { if (name === 'react') return React; throw new Error('no module ' + name) })
  const locale = {
    register(ns, d) { dicts[ns] = d; return () => {} },
    bind(ns) { return (key, values) => { const d = dicts[ns] && dicts[ns][LANG === 'zh' ? 'zh' : 'en']; let s = (d && d[key]) || key; for (const k in (values || {})) s = s.split('{' + k + '}').join(values[k]); return LANG === 'pseudo' ? stretch(s) : s } },
    subscribe() { return () => {} },
    getSnapshot() { return SNAP },
  }
  const SNAP = { active: LANG === 'zh' ? 'zh-CN' : 'en-US' }
  plugin.apply({
    effect(fn) { fn() },
    locale,
    slots: { inject(name, fn) { return fn() }, register(meta, C) { if (meta.name === 'main') { Page = C; pageProps = meta.inject() } return () => {} } },
  })
} }
</script>
<script src="/client.js"></script>
</head><body><div id="root"></div>
<script>if (document.documentElement.dataset.theme === 'dark') document.body.setAttribute('data-ds-dark-theme', '')</script>
<script>ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Page, pageProps))</script>
</body></html>`
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html) }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end() }
    if (url.pathname === '/client.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(readFileSync(process.env.BOOKSHELF_CLIENT || `${P}/client.js`)) }
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
