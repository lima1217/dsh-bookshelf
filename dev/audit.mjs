/**
 * Screenshot and measure the bookshelf panel across viewports, languages,
 * themes, and UI states, against the real client.js running in the harness.
 *
 *   node dev/audit.mjs [--out DIR] [--client FILE] [--full] [--shots]
 *
 * --client  serve another client.js (an old copy, for before/after shots)
 * --full    every viewport × zh/en/pseudo × light/dark (default: a quick subset)
 * --shots   save PNGs (DIR/<state>-<lang>-<theme>-<w>.png)
 *
 * Per screen it records: distinct font sizes; chromatic colors (accents) and
 * cool grays, measured in OKLCH; text below WCAG contrast; UI text that is
 * clipped (user data such as long titles is allowed to clamp); click targets
 * under 24 px; italic, monospace, and all-caps text; "·" in visible text; and
 * axe-core violations. Writes DIR/report.json and prints a summary.
 *
 * Env: PLAYWRIGHT_DIR (node_modules holding playwright), AXE_FILE (axe.min.js).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureBooks } from './fixture.mjs'

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const OUT = option('--out', join(tmpdir(), 'bookshelf-audit'))
const CLIENT = option('--client', '')
const PORT = 47900 + Math.floor(Math.random() * 90)
const ROOT = new URL('..', import.meta.url).pathname
const require = createRequire(`${process.env.PLAYWRIGHT_DIR || `${process.env.HOME}/.npm/_npx/9833c18b2d85bc59/node_modules`}/`)
const { chromium } = require('playwright')
const AXE = readFileSync(process.env.AXE_FILE || '/tmp/bs-tools/node_modules/axe-core/axe.min.js', 'utf8')

const VIEWPORTS = flag('--full')
  ? [[375, 812], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]]
  : [[390, 844], [1280, 800]]
const LANGS = flag('--full') ? ['zh', 'en', 'pseudo'] : ['zh', 'en']
const THEMES = ['light', 'dark']

/** Classes whose text is the user's own data; clamping it (with a tooltip) is allowed. */
const USER_DATA = ['bs-book-title', 'bs-book-author', 'bs-book-meta', 'bs-desc', 'bs-note', 'bs-list-title', 'bs-list-author',
  'bs-tile-title', 'bs-tile-sub', 'bs-finished-title', 'bs-chip', 'bs-tag', 'bs-sync-current', 'bs-import-file', 'bs-input',
  'bs-textarea', 'bs-list-tags', 'bs-meta-part', 'bs-toast-text', 'bs-excerpt-text']

const click = selectors => async page => {
  for (const selector of selectors) {
    const target = page.locator(selector).first()
    if (await target.count()) return target.click()
  }
  throw new Error(`nothing to click: ${selectors.join(' | ')}`)
}
const openBook = title => async page => {
  const card = page.locator('.bs-card, .bs-list-row', { hasText: title }).first()
  const opener = card.locator('.bs-card-open, .bs-edit').first()
  await opener.click()
}

const STATES = [
  { id: 'first-run', empty: true, steps: [] },
  { id: 'board', steps: [] },
  { id: 'list', steps: [click(['.bs-view-button:nth-child(2)'])] },
  { id: 'grid', steps: [click(['.bs-view-button:nth-child(3)'])] },
  { id: 'add', steps: [click(['[data-action=add]', '.bs-col-add'])] },
  { id: 'edit-reading', steps: [openBook('置身事内')] },
  { id: 'edit-read', steps: [openBook('献给阿尔吉侬的花束')] },
  { id: 'import', steps: [click(['[data-action=import]', '.bs-actions .bs-tool:nth-child(1)']), async page => {
    await page.locator('.bs-import-text').fill('置身事内 - 兰小欢\n《人类简史》尤瓦尔·赫拉利\nDune - Frank Herbert\n乡土中国')
  }] },
  { id: 'export', steps: [click(['[data-action=export]', '.bs-actions .bs-tool:nth-child(2)'])] },
  { id: 'stats', steps: [click(['[data-action=stats]', '.bs-stat-button'])] },
  { id: 'search-empty', steps: [async page => page.locator('.bs-search-input').fill('不存在的书名')] },
]

function startHarness(file) {
  const child = spawn(process.execPath, [join(ROOT, 'dev/harness.mjs')], {
    env: { ...process.env, PORT: String(PORT), DSH_BOOKSHELF_FILE: file, ...(CLIENT ? { BOOKSHELF_CLIENT: CLIENT } : {}) },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('harness on')) resolve(child) })
    child.on('exit', code => reject(new Error(`harness exited ${code}`)))
  })
}

const base = `http://127.0.0.1:${PORT}`
async function setShelf(books) {
  const state = await (await fetch(`${base}/api/dsh-bookshelf/state`)).json()
  const response = await fetch(`${base}/api/dsh-bookshelf/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 2, baseRevision: state.revision || 0, books }),
  })
  if (!response.ok) throw new Error(`PUT failed: ${response.status} ${await response.text()}`)
}

/** Runs inside the page. */
function measure(userData) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const rgba = value => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const oklch = ([r, g, b]) => {
    const [R, G, B] = [lin(r), lin(g), lin(b)]
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    const C = Math.hypot(A, Bb)
    let H = Math.atan2(Bb, A) * 180 / Math.PI
    if (H < 0) H += 360
    return { L, C, H }
  }
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const over = (top, bottom) => [0, 1, 2].map(i => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1)
  const backdrop = element => {
    const layers = []
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const color = rgba(getComputedStyle(node).backgroundColor)
      if (color[3] > 0) layers.push(color)
      if (color[3] >= 1) break
    }
    let result = rgba(getComputedStyle(document.body).backgroundColor)
    if (result[3] === 0) result = [255, 255, 255, 1]
    for (const layer of layers.reverse()) result = over(layer, result)
    return result
  }
  const visible = element => {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    const style = getComputedStyle(element)
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05
  }
  const ownText = element => {
    if (['INPUT', 'TEXTAREA'].includes(element.tagName)) return element.value || element.placeholder || ''
    if (element.tagName === 'SELECT') return element.selectedOptions[0] ? element.selectedOptions[0].text : ''
    return Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim()
  }
  const inArtwork = element => element.closest('.bs-cover') !== null
  const isUserData = element => userData.some(name => element.closest(`.${name}`) !== null)
  const label = element => `${element.tagName.toLowerCase()}.${String(element.className).split(' ').filter(Boolean).join('.')}`

  const root = document.querySelector('.bs-page')
  const all = [root, ...root.querySelectorAll('*')].filter(visible)
  const sizes = new Map(); const accents = new Map(); const coolGrays = new Map()
  const contrast = []; const clipped = []; const small = []; const styled = []; const dots = []
  const noteColor = (value, where) => {
    const color = rgba(value)
    if (color[3] < 0.15) return
    const { L, C, H } = oklch(color)
    const key = `rgb(${color.slice(0, 3).join(',')})`
    if (C > 0.04) accents.set(key, { hue: Math.round(H), where })
    else if (C > 0.006 && H > 180 && H < 300 && L > 0.15 && L < 0.97) coolGrays.set(key, where)
  }
  for (const element of all) {
    if (element.tagName === 'svg' || element.closest('svg') || inArtwork(element)) continue
    const style = getComputedStyle(element)
    const text = ownText(element)
    noteColor(style.backgroundColor, label(element))
    if (style.borderTopWidth !== '0px') noteColor(style.borderTopColor, label(element))
    if (text === '') continue
    noteColor(style.color, label(element))
    const size = parseFloat(style.fontSize)
    sizes.set(size, (sizes.get(size) || []).concat(text.slice(0, 16)))
    if (style.fontStyle === 'italic') styled.push(`italic: ${text.slice(0, 30)}`)
    if (style.textTransform === 'uppercase' || (/[A-Z]{4,}/.test(text) && text === text.toUpperCase() && /[A-Z]/.test(text))) styled.push(`caps: ${text.slice(0, 30)}`)
    if (/mono/i.test(style.fontFamily)) styled.push(`mono: ${text.slice(0, 30)}`)
    if (text.includes('·') && !isUserData(element)) dots.push(text.slice(0, 40))
    const disabled = element.closest(':disabled,[aria-disabled="true"]') !== null
    const placeholder = ['INPUT', 'TEXTAREA'].includes(element.tagName) && !element.value
    if (!disabled) {
      const fg = rgba(placeholder ? getComputedStyle(element, '::placeholder').color : style.color)
      const bg = backdrop(element)
      const value = ratio(over(fg, bg), bg)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      if (value < (large ? 3 : 4.5)) contrast.push(`${value.toFixed(2)} ${label(element)} “${text.slice(0, 24)}”`)
    }
    const clips = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 2
    const hides = /hidden|clip/.test(style.overflow + style.overflowX) || style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none'
    if (clips && hides && !isUserData(element) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) clipped.push(`${label(element)} “${text.slice(0, 30)}”`)
  }
  // Text that spills past its own box or the viewport.
  const width = document.documentElement.clientWidth
  for (const element of all) {
    const rect = element.getBoundingClientRect()
    if (rect.right > width + 1 && ownText(element) !== '' && !element.closest('.bs-tabs')) clipped.push(`offscreen ${label(element)} “${ownText(element).slice(0, 30)}”`)
  }
  for (const element of root.querySelectorAll('button,select,input,textarea,a,[role=tab],[role=radio]')) {
    if (!visible(element) || element.type === 'hidden') continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 24 || rect.height < 24) small.push(`${Math.round(rect.width)}×${Math.round(rect.height)} ${label(element)} ${element.getAttribute('aria-label') || ownText(element).slice(0, 20)}`)
  }
  return {
    fontSizes: [...sizes.keys()].sort((a, b) => a - b),
    fontSamples: Object.fromEntries([...sizes].map(([size, texts]) => [size, [...new Set(texts)].slice(0, 4)])),
    accents: [...accents].map(([color, info]) => `${color} h${info.hue} ${info.where}`),
    accentHues: [...new Set([...accents.values()].map(info => Math.round(info.hue / 20) * 20))],
    coolGrays: [...coolGrays].map(([color, where]) => `${color} ${where}`),
    contrast, clipped: [...new Set(clipped)], small, styled: [...new Set(styled)], dots: [...new Set(dots)],
    pageOverflowX: document.documentElement.scrollWidth > width + 1,
  }
}

const shelfFile = join(tmpdir(), `bookshelf-audit-${PORT}.json`)
rmSync(shelfFile, { force: true })
const harness = await startHarness(shelfFile)
const browser = await chromium.launch({ channel: 'chrome' })
mkdirSync(OUT, { recursive: true })
const report = []
try {
  for (const state of STATES) {
    await setShelf(state.empty ? [] : fixtureBooks())
    for (const [width, height] of VIEWPORTS) {
      for (const lang of LANGS) {
        for (const theme of THEMES) {
          const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' })
          const page = await context.newPage()
          const errors = []
          page.on('pageerror', error => errors.push(String(error)))
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
          for (let attempt = 0; ; attempt += 1) {
            try {
              await page.goto(`${base}/?lang=${lang}&theme=${theme}`, { timeout: 60000 })
              break
            } catch (error) {
              if (attempt >= 2) throw error
            }
          }
          await page.waitForSelector('.bs-page')
          await page.waitForTimeout(250)
          let failed = ''
          try {
            for (const step of state.steps) await step(page)
          } catch (error) {
            failed = String(error.message || error).split('\n')[0]
          }
          await page.waitForTimeout(200)
          const metrics = await page.evaluate(measure, USER_DATA)
          await page.addScriptTag({ content: AXE })
          const axe = await page.evaluate(async () => {
            const result = await window.axe.run(document.querySelector('.bs-page'), { resultTypes: ['violations'] })
            return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
              .map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`)
          })
          const name = `${state.id}-${lang}-${theme}-${width}`
          if (flag('--shots')) await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
          report.push({ name, state: state.id, lang, theme, width, failed, errors, axe, ...metrics })
          await context.close()
        }
      }
    }
  }
} finally {
  await browser.close()
  harness.kill()
  rmSync(shelfFile, { force: true })
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
const worst = key => Math.max(...report.map(row => (Array.isArray(row[key]) ? row[key].length : 0)))
console.log(`screens: ${report.length}   report: ${join(OUT, 'report.json')}`)
console.log(`max font sizes on one screen: ${Math.max(...report.map(row => row.fontSizes.length))}`)
console.log(`max accent hues on one screen: ${Math.max(...report.map(row => row.accentHues.length))}`)
for (const key of ['coolGrays', 'contrast', 'clipped', 'small', 'styled', 'dots', 'axe', 'errors']) {
  const rows = report.filter(row => row[key].length > 0)
  console.log(`${key}: ${rows.length} screens, worst ${worst(key)}`)
}
console.log(`failed steps: ${report.filter(row => row.failed).map(row => `${row.name}: ${row.failed}`).join('; ') || 'none'}`)
console.log(`page scrolls sideways: ${report.filter(row => row.pageOverflowX).map(row => row.name).join(', ') || 'none'}`)
