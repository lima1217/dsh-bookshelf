/**
 * Before/after PDF: one page per change, old screenshot on the left, new on
 * the right, same viewport, language, theme, and data.
 *
 *   node dev/compare-pdf.mjs BEFORE_DIR AFTER_DIR OUT.pdf PAIRS.json
 *
 * PAIRS.json: [{ "shot": "board-zh-light-1280", "title": "…", "notes": ["…"] }]
 * The shots come from `node dev/audit.mjs --shots` run against each version.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const [beforeDir, afterDir, out, pairsFile] = process.argv.slice(2)
const require = createRequire(`${process.env.PLAYWRIGHT_DIR || `${process.env.HOME}/.npm/_npx/9833c18b2d85bc59/node_modules`}/`)
const { chromium } = require('playwright')
const pairs = JSON.parse(readFileSync(pairsFile, 'utf8'))
const image = (dir, shot) => `data:image/png;base64,${readFileSync(join(dir, `${shot}.png`)).toString('base64')}`
const escape = text => text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

const pages = pairs.map((pair, index) => `
<section>
  <header><span>${index + 1} / ${pairs.length}</span><h1>${escape(pair.title)}</h1><code>${pair.shot}</code></header>
  <div class="pair${pair.shot.endsWith('-390') ? ' narrow' : ''}">
    <figure><figcaption>改前</figcaption><img src="${image(beforeDir, pair.shot)}"></figure>
    <figure><figcaption>改后</figcaption><img src="${image(afterDir, pair.shot)}"></figure>
  </div>
  <ul>${pair.notes.map(note => `<li>${escape(note)}</li>`).join('')}</ul>
</section>`).join('')

const html = `<!doctype html><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:12mm}
body{margin:0;font-family:-apple-system,"PingFang SC",sans-serif;color:#2b2722}
section{page-break-after:always;display:flex;flex-direction:column;gap:8px;height:186mm}
header{display:flex;align-items:baseline;gap:12px}
header span{color:#6b6359;font-size:11px}
h1{margin:0;font-size:17px;font-weight:600}
code{margin-left:auto;color:#6b6359;font-size:10px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0}
.pair.narrow{grid-template-columns:auto auto;justify-content:center}
figure{display:flex;flex-direction:column;gap:4px;min-height:0;margin:0}
figcaption{font-size:11px;font-weight:600;color:#6b6359}
img{min-height:0;max-width:100%;max-height:100%;object-fit:contain;object-position:top left;border:1px solid #e6e1d9;border-radius:6px}
ul{margin:0;padding-left:18px;font-size:11.5px;line-height:1.6;columns:2;column-gap:24px}
</style>${pages}`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({ path: resolve(out), format: 'A4', landscape: true, printBackground: true })
await browser.close()
console.log('wrote', resolve(out))
