/**
 * dsh-bookshelf — host half.
 *
 * Owns the durable shelf: one JSON document under the DSH storage directory,
 * exposed two ways:
 *
 *  - to the browser half over a loopback-only, same-origin HTTP route. Writes
 *    carry the revision they were based on; a stale write gets 409 plus the
 *    current shelf so the client can rebase instead of clobbering it.
 *  - to the agent as `bookshelf_*` tools (list, stats, add, update, excerpt),
 *    so a conversation can read the shelf and log reading without the panel.
 *
 * The Client keeps a localStorage copy as an instant cache and offline queue;
 * the Host file is authoritative.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-bookshelf'
export const inject = ['webServer']

const ROUTE_STATE = '/api/dsh-bookshelf/state'
const ROUTE_REVISION = '/api/dsh-bookshelf/revision'
/** v2 adds reading dates, page progress, tags, and excerpts; v1 files are read and upgraded on write. */
const STORE_VERSION = 2
const READABLE_VERSIONS = new Set([1, 2])
const MAX_BODY_BYTES = 32 * 1024 * 1024
const MAX_BOOKS = 5000
const MAX_TAGS = 12
const MAX_EXCERPTS = 300
const STATUSES = new Set(['want', 'reading', 'read'])
const STATUS_LIST = ['want', 'reading', 'read']
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
}

/** The file can be overridden for tests; production follows the DSH home. */
function dataFile() {
  if (typeof process.env.DSH_BOOKSHELF_FILE === 'string' && process.env.DSH_BOOKSHELF_FILE !== '') {
    return process.env.DSH_BOOKSHELF_FILE
  }
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'storages', 'bookshelf.json')
}

/** One request-scoped HTTP error with the status the route should return. */
function httpError(status, message, extra) {
  const error = new Error(message)
  error.status = status
  if (extra !== undefined) error.body = extra
  return error
}

/* ── normalization ──────────────────────────────────────────────────── */

function text(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').trim().slice(0, max)
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function timestamp(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return ''
  const url = value.trim().replace(/^http:\/\//i, 'https://')
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url.slice(0, 600) : ''
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const tags = []
  for (const entry of value) {
    const tag = text(entry, 24).replace(/^#+/, '').replace(/\s+/g, ' ')
    const key = tag.toLocaleLowerCase()
    if (tag === '' || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

function normalizeExcerpts(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const excerpts = []
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object') continue
    const body = text(raw.text, 2000)
    if (body === '') continue
    let id = text(raw.id, 80) || `ex-${randomUUID()}`
    if (seen.has(id)) id = `ex-${randomUUID()}`
    seen.add(id)
    excerpts.push({
      id,
      text: body,
      page: clampNumber(raw.page, 0, 20000, 0),
      note: text(raw.note, 600),
      createdAt: timestamp(raw.createdAt) || Date.now(),
    })
    if (excerpts.length >= MAX_EXCERPTS) break
  }
  return excerpts
}

/** Page position wins over a stored percentage whenever both page counts are known. */
function deriveProgress(status, progress, currentPage, pages) {
  if (status === 'read') return 100
  if (pages > 0 && currentPage > 0) return Math.min(100, Math.round((currentPage / pages) * 100))
  return progress
}

/**
 * Validate and copy exactly the fields the bookshelf stores. Unknown fields are
 * dropped so a malformed client cannot grow the durable document.
 */
function normalizeBook(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw httpError(400, 'book entries must be objects')
  }
  const title = text(raw.title, 240)
  if (title === '') throw httpError(400, 'every book needs a title')
  const status = STATUSES.has(raw.status) ? raw.status : 'want'
  const addedAt = timestamp(raw.addedAt) || Date.now()
  const pages = clampNumber(raw.pages, 0, 20000, 0)
  const currentPage = clampNumber(raw.currentPage, 0, 20000, 0)
  return {
    id: text(raw.id, 120) || `book-${randomUUID()}`,
    title,
    author: text(raw.author, 160),
    status,
    progress: deriveProgress(status, clampNumber(raw.progress, 0, 100, 0), currentPage, pages),
    currentPage,
    rating: clampNumber(raw.rating, 0, 5, 0),
    note: text(raw.note, 4000),
    tags: normalizeTags(raw.tags),
    excerpts: normalizeExcerpts(raw.excerpts),
    addedAt,
    updatedAt: timestamp(raw.updatedAt) || addedAt,
    startedAt: timestamp(raw.startedAt),
    finishedAt: status === 'read' ? timestamp(raw.finishedAt) : 0,
    cover: safeImageUrl(raw.cover),
    description: text(raw.description, 2000),
    publisher: text(raw.publisher, 160),
    published: text(raw.published, 16),
    pages,
    isbn: text(raw.isbn, 20),
    metaStatus: raw.metaStatus === 'ok' || raw.metaStatus === 'miss' ? raw.metaStatus : '',
  }
}

function normalizeBooks(value) {
  if (!Array.isArray(value)) throw httpError(400, 'books must be an array')
  if (value.length > MAX_BOOKS) throw httpError(400, `at most ${MAX_BOOKS} books are supported`)
  const seen = new Set()
  return value.map(entry => {
    const book = normalizeBook(entry)
    if (seen.has(book.id)) book.id = `book-${randomUUID()}`
    seen.add(book.id)
    return book
  })
}

/**
 * Move a book to `status`, stamping the reading dates the way a reader would:
 * starting stamps `startedAt` once, finishing stamps `finishedAt`, and going
 * back to want-to-read clears both.
 */
function applyStatus(book, status, now) {
  if (!STATUSES.has(status) || status === book.status) return book
  const next = { ...book, status }
  if (status === 'reading') {
    if (next.startedAt === 0) next.startedAt = now
    next.finishedAt = 0
    if (next.progress >= 100) {
      next.progress = 0
      next.currentPage = 0
    }
  } else if (status === 'read') {
    if (next.finishedAt === 0) next.finishedAt = now
    next.progress = 100
  } else {
    next.startedAt = 0
    next.finishedAt = 0
    if (next.progress >= 100) {
      next.progress = 0
      next.currentPage = 0
    }
  }
  return next
}

/* ── storage ────────────────────────────────────────────────────────── */

/** Read and validate the durable document; `null` means it has never been written. */
async function readStore() {
  let raw
  try {
    raw = await readFile(dataFile(), 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw httpError(500, 'bookshelf.json is not valid JSON; the file was left untouched')
  }
  if (parsed === null || typeof parsed !== 'object' || !READABLE_VERSIONS.has(parsed.version) || !Array.isArray(parsed.books)) {
    throw httpError(500, 'bookshelf.json has an unsupported shape; the file was left untouched')
  }
  return {
    revision: Number.isSafeInteger(parsed.revision) ? parsed.revision : 0,
    updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    books: normalizeBooks(parsed.books),
  }
}

/** Atomically replace the document at `revision + 1`. Callers hold the write chain. */
async function writeStore(revision, books) {
  const next = {
    version: STORE_VERSION,
    revision: revision + 1,
    updatedAt: Date.now(),
    books,
  }
  const target = dataFile()
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  return next
}

/** Serialize writes so browser windows and agent tools cannot interleave a read/modify/write. */
let writeChain = Promise.resolve()
function serializedWrite(operation) {
  const run = writeChain.then(operation, operation)
  writeChain = run.then(() => undefined, () => undefined)
  return run
}

/**
 * Read-modify-write under the chain. `mutate` gets the current books (empty for
 * a never-written shelf) and returns the next list plus a result for the caller.
 */
function mutateStore(mutate) {
  return serializedWrite(async () => {
    const current = await readStore()
    const books = current === null ? [] : current.books
    const { books: nextBooks, result } = mutate(books.map(book => ({ ...book })))
    if (nextBooks.length > MAX_BOOKS) throw new Error(`at most ${MAX_BOOKS} books are supported`)
    const saved = await writeStore(current === null ? 0 : current.revision, normalizeBooks(nextBooks))
    return { saved, result }
  })
}

/* ── HTTP route ─────────────────────────────────────────────────────── */

function writeJson(response, status, body) {
  response.writeHead(status, JSON_HEADERS)
  response.end(JSON.stringify(body))
}

/** Read a bounded JSON body from the request. */
function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    let settled = false
    request.setEncoding('utf8')
    request.on('data', chunk => {
      if (settled) return
      size += Buffer.byteLength(chunk)
      if (size > MAX_BODY_BYTES) {
        settled = true
        reject(httpError(413, 'request body is too large'))
        request.destroy()
        return
      }
      body += chunk
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve(body === '' ? {} : JSON.parse(body))
      } catch {
        reject(httpError(400, 'request body is not valid JSON'))
      }
    })
    request.on('error', error => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function isIPv4Loopback(value) {
  const parts = value.split('.')
  return parts.length === 4 &&
    parts[0] === '127' &&
    parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
}

function isLoopbackAddress(address) {
  if (address === undefined) return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isIPv4Loopback(normalized.slice(7))
  return isIPv4Loopback(normalized)
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  return isIPv4Loopback(hostname)
}

/** Treat the route as a local-only capability, not a network API. */
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function shelfBody(store) {
  return {
    ok: true,
    revision: store === null ? 0 : store.revision,
    updatedAt: store === null ? 0 : store.updatedAt,
    books: store === null ? null : store.books,
  }
}

async function handleState(request, response) {
  if (request.method === 'GET') {
    writeJson(response, 200, shelfBody(await readStore()))
    return
  }
  if (request.method === 'PUT') {
    const body = await readJsonBody(request)
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'request body must be an object')
    }
    if (body.version !== STORE_VERSION) {
      throw httpError(400, `unsupported store version: ${String(body.version)}; reload the bookshelf panel`)
    }
    if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) {
      throw httpError(400, 'baseRevision is required')
    }
    const books = normalizeBooks(body.books)
    const saved = await serializedWrite(async () => {
      const current = await readStore()
      const revision = current === null ? 0 : current.revision
      if (body.baseRevision !== revision) {
        // Someone else (another window, the agent) wrote since this client
        // last synced: hand back the current shelf so it can rebase.
        throw httpError(409, 'the shelf changed since this copy was loaded', {
          ...shelfBody(current),
          ok: false,
          error: 'conflict',
        })
      }
      return writeStore(revision, books)
    })
    writeJson(response, 200, shelfBody(saved))
    return
  }
  response.writeHead(405, { ...JSON_HEADERS, allow: 'GET, PUT' })
  response.end(JSON.stringify({ error: `method not allowed: ${request.method}` }))
}

async function handleRevision(request, response) {
  if (request.method !== 'GET') {
    response.writeHead(405, { ...JSON_HEADERS, allow: 'GET' })
    response.end(JSON.stringify({ error: `method not allowed: ${request.method}` }))
    return
  }
  const store = await readStore()
  writeJson(response, 200, { ok: true, revision: store === null ? 0 : store.revision })
}

function route(path, handle, logger) {
  return {
    kind: 'exact',
    path,
    async handler(request, response) {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, { error: 'forbidden: loopback-only' })
        return
      }
      try {
        await handle(request, response)
      } catch (error) {
        const status = error && Number.isInteger(error.status) ? error.status : 500
        if (status >= 500 && logger && typeof logger.error === 'function') {
          logger.error(`bookshelf: ${path} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
        writeJson(response, status, error && error.body !== undefined
          ? error.body
          : { error: error instanceof Error ? error.message : 'bookshelf storage failed' })
      }
    },
  }
}

/* ── agent tools ────────────────────────────────────────────────────── */

const STATUS_NAMES = { want: 'want to read', reading: 'reading', read: 'finished' }

function titleKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[（(〔[【][^）)〕\]】]*[）)〕\]】]/g, '')
    .split(/[:：]/)[0]
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** Local calendar date, the way the reader thinks about "the day I finished". */
function isoDate(ms) {
  if (!ms) return ''
  const date = new Date(ms)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` (or `today`) to local noon, so a timezone shift never moves the day. */
function parseDate(value, field) {
  if (value === undefined) return undefined
  if (value === '' || value === null) return 0
  if (value === 'today') return Date.now()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim())
  if (!match) throw new Error(`${field} must be YYYY-MM-DD, "today", or "" to clear`)
  const ms = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12).getTime()
  if (!Number.isFinite(ms)) throw new Error(`${field} is not a valid date`)
  return ms
}

/** Resolve the `book` argument (id or title) to exactly one book or explain why not. */
function findBook(books, ref) {
  const wanted = String(ref || '').trim()
  if (wanted === '') throw new Error('book is required: pass a book id or its title')
  const byId = books.find(book => book.id === wanted)
  if (byId) return byId
  const key = titleKey(wanted)
  const exact = books.filter(book => titleKey(book.title) === key)
  if (exact.length === 1) return exact[0]
  const loose = exact.length > 1
    ? exact
    : books.filter(book => key !== '' && titleKey(book.title).includes(key))
  if (loose.length === 1) return loose[0]
  if (loose.length === 0) throw new Error(`no book on the shelf matches "${wanted}"; call bookshelf_list to see titles`)
  const options = loose.slice(0, 8).map(book => `${book.id} 《${book.title}》${book.author ? ` ${book.author}` : ''}`)
  throw new Error(`"${wanted}" matches ${loose.length} books; pass one id instead:\n${options.join('\n')}`)
}

/** The model-facing view of one book: dates as calendar days, long fields trimmed. */
function bookView(book, detail) {
  const view = {
    id: book.id,
    title: book.title,
    author: book.author,
    status: book.status,
    progress: book.progress,
    rating: book.rating,
    tags: book.tags,
    added: isoDate(book.addedAt),
  }
  if (book.pages > 0) view.pages = book.pages
  if (book.currentPage > 0) view.currentPage = book.currentPage
  if (book.startedAt) view.started = isoDate(book.startedAt)
  if (book.finishedAt) view.finished = isoDate(book.finishedAt)
  if (book.note !== '') view.note = detail ? book.note : book.note.slice(0, 160)
  if (book.excerpts.length > 0) view.excerptCount = book.excerpts.length
  if (detail) {
    if (book.publisher !== '') view.publisher = book.publisher
    if (book.published !== '') view.published = book.published
    if (book.isbn !== '') view.isbn = book.isbn
    if (book.description !== '') view.description = book.description.slice(0, 600)
    if (book.excerpts.length > 0) {
      view.excerpts = book.excerpts.slice(-20).map(excerpt => ({
        text: excerpt.text,
        ...(excerpt.page > 0 ? { page: excerpt.page } : {}),
        ...(excerpt.note !== '' ? { note: excerpt.note } : {}),
        date: isoDate(excerpt.createdAt),
      }))
    }
  }
  return view
}

function bookLine(book) {
  const parts = [`[${book.id}] 《${book.title}》`]
  if (book.author) parts.push(book.author)
  parts.push(STATUS_NAMES[book.status])
  if (book.status === 'reading') {
    parts.push(book.pages > 0 && book.currentPage > 0
      ? `p.${book.currentPage}/${book.pages} (${book.progress}%)`
      : `${book.progress}%`)
  }
  if (book.rating > 0) parts.push(`${'★'.repeat(book.rating)}`)
  if (book.finishedAt) parts.push(`finished ${isoDate(book.finishedAt)}`)
  else if (book.startedAt) parts.push(`started ${isoDate(book.startedAt)}`)
  if (book.tags.length > 0) parts.push(book.tags.map(tag => `#${tag}`).join(' '))
  if (book.excerpts.length > 0) parts.push(`${book.excerpts.length} excerpts`)
  let line = parts.join(' · ')
  if (book.note !== '') line += `\n    note: ${book.note.slice(0, 160).replace(/\s+/g, ' ')}`
  return line
}

/** Reading statistics for one calendar year (local time). */
function yearStats(books, year) {
  const inYear = ms => ms > 0 && new Date(ms).getFullYear() === year
  const finished = books
    .filter(book => book.status === 'read' && inYear(book.finishedAt))
    .sort((left, right) => left.finishedAt - right.finishedAt)
  const rated = finished.filter(book => book.rating > 0)
  const byMonth = Array.from({ length: 12 }, () => 0)
  for (const book of finished) byMonth[new Date(book.finishedAt).getMonth()] += 1
  const tagCounts = new Map()
  for (const book of finished) for (const tag of book.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
  const durations = finished
    .filter(book => book.startedAt > 0 && book.finishedAt >= book.startedAt)
    .map(book => Math.max(1, Math.round((book.finishedAt - book.startedAt) / 86400000)))
  return {
    year,
    finished: finished.length,
    pagesFinished: finished.reduce((sum, book) => sum + book.pages, 0),
    averageRating: rated.length === 0 ? 0 : Math.round((rated.reduce((sum, book) => sum + book.rating, 0) / rated.length) * 10) / 10,
    averageDays: durations.length === 0 ? 0 : Math.round(durations.reduce((sum, days) => sum + days, 0) / durations.length),
    byMonth,
    topTags: [...tagCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([tag, count]) => ({ tag, count })),
    finishedBooks: finished.map(book => ({ id: book.id, title: book.title, author: book.author, rating: book.rating, finished: isoDate(book.finishedAt) })),
    reading: books.filter(book => book.status === 'reading').length,
    want: books.filter(book => book.status === 'want').length,
    total: books.length,
  }
}

const TAGS_SCHEMA = { type: 'array', items: { type: 'string' } }
const BOOK_REF = {
  type: 'string',
  description: 'The book: its id from bookshelf_list (preferred), or its exact title.',
}
const WRITE_OUTPUT = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    book: { type: 'object' },
    revision: { type: 'integer' },
  },
  required: ['action', 'book', 'revision'],
}

function textResult(text) {
  return [{ type: 'text', text }]
}

function writeRender(_args, value) {
  return textResult(`${value.action}:\n${JSON.stringify(value.book, null, 2)}`)
}

function registerTools(ctx) {
  const tools = ctx.tools
  const present = (title, kind) => args => ({ card: 'generic', title, kind, rawInput: args })

  ctx.effect(() => tools.register({
    name: 'bookshelf_list',
    description: [
      "Read the user's personal bookshelf (the 'My Bookshelf' panel in DSH): books they want to read, are reading, or finished,",
      'with progress, ratings, tags, reading dates, and notes. Use it whenever the user mentions their books, reading list,',
      'what to read next, or a specific book they own. Pass `book` to get one book in full, including its saved excerpts.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUS_LIST, description: 'Only books with this status.' },
        query: { type: 'string', description: 'Case-insensitive match against title, author, note, and tags.' },
        tag: { type: 'string', description: 'Only books carrying this tag.' },
        book: { ...BOOK_REF, description: 'Return this single book in full detail (id or title).' },
        limit: { type: 'integer', description: 'Maximum books to return (default 60, max 300).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          matched: { type: 'integer' },
          books: { type: 'array', items: { type: 'object' } },
        },
        required: ['total', 'matched', 'books'],
      },
      render(_args, value) {
        if (value.detail) return textResult(JSON.stringify(value.books[0], null, 2))
        if (value.total === 0) return textResult('The bookshelf is empty.')
        const head = `${value.matched} of ${value.total} books${value.books.length < value.matched ? ` (showing ${value.books.length})` : ''}:`
        return textResult([head, ...value.lines].join('\n'))
      },
    },
    isConcurrencySafe: () => true,
    presentCall: present('Read bookshelf', 'read'),
    async execute(args) {
      const store = await readStore()
      const books = store === null ? [] : store.books
      if (typeof args.book === 'string' && args.book.trim() !== '') {
        const book = findBook(books, args.book)
        return { total: books.length, matched: 1, detail: true, books: [bookView(book, true)] }
      }
      const needle = typeof args.query === 'string' ? args.query.trim().toLocaleLowerCase() : ''
      const tag = typeof args.tag === 'string' ? args.tag.trim().replace(/^#/, '').toLocaleLowerCase() : ''
      const matched = books
        .filter(book => !args.status || book.status === args.status)
        .filter(book => tag === '' || book.tags.some(item => item.toLocaleLowerCase() === tag))
        .filter(book => needle === '' ||
          `${book.title} ${book.author} ${book.note} ${book.tags.join(' ')}`.toLocaleLowerCase().includes(needle))
        .sort((left, right) => STATUS_LIST.indexOf(left.status) - STATUS_LIST.indexOf(right.status) ||
          Math.max(right.updatedAt, right.addedAt) - Math.max(left.updatedAt, left.addedAt))
      const limit = clampNumber(args.limit, 1, 300, 60)
      const shown = matched.slice(0, limit)
      return {
        total: books.length,
        matched: matched.length,
        books: shown.map(book => bookView(book, false)),
        lines: shown.map(bookLine),
      }
    },
  }), 'bookshelf: tool list')

  ctx.effect(() => tools.register({
    name: 'bookshelf_stats',
    description: "Reading statistics from the user's bookshelf for one calendar year: books finished, pages, average rating and days per book, monthly counts, top tags, and the finished titles. Use for 'how much did I read this year' style questions or a year-in-review.",
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: 'Calendar year; defaults to the current year.' },
      },
    },
    output: {
      schema: { type: 'object', properties: { year: { type: 'integer' }, finished: { type: 'integer' } }, required: ['year', 'finished'] },
      render: (_args, value) => textResult(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => true,
    presentCall: present('Reading stats', 'read'),
    async execute(args) {
      const store = await readStore()
      const year = clampNumber(args.year, 1900, 9999, new Date().getFullYear())
      return yearStats(store === null ? [] : store.books, year)
    },
  }), 'bookshelf: tool stats')

  ctx.effect(() => tools.register({
    name: 'bookshelf_add',
    description: "Put a book on the user's bookshelf. Only call this when the user asks to add or log a book. If a book with the same title is already there it is returned unchanged instead of duplicated (use bookshelf_update to change it). Cover and description are filled in later by the panel's online lookup.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Book title, without 《》 or quotes.' },
        author: { type: 'string' },
        status: { type: 'string', enum: STATUS_LIST, description: 'Default "want".' },
        rating: { type: 'integer', description: '1-5 stars, for finished books.' },
        pages: { type: 'integer', description: 'Total page count, if known.' },
        currentPage: { type: 'integer', description: 'Page the user is on, for books being read.' },
        tags: TAGS_SCHEMA,
        note: { type: 'string', description: "The user's own note or reason to read it." },
        started: { type: 'string', description: 'YYYY-MM-DD or "today"; defaults to today when status is reading.' },
        finished: { type: 'string', description: 'YYYY-MM-DD or "today"; defaults to today when status is read.' },
      },
      required: ['title'],
    },
    output: { schema: WRITE_OUTPUT, render: writeRender },
    presentCall: present('Add to bookshelf', 'edit'),
    async execute(args) {
      const title = text(args.title, 240).replace(/^[《「『"']+|[》」』"']+$/g, '').trim()
      if (title === '') throw new Error('title is required')
      const started = parseDate(args.started, 'started')
      const finished = parseDate(args.finished, 'finished')
      const { saved, result } = await mutateStore(books => {
        const existing = books.find(book => titleKey(book.title) === titleKey(title))
        if (existing) return { books, result: { action: 'Already on the shelf (unchanged)', book: existing } }
        const now = Date.now()
        let book = normalizeBook({
          title,
          author: args.author,
          status: 'want',
          pages: args.pages,
          currentPage: args.currentPage,
          tags: args.tags,
          note: args.note,
          addedAt: now,
          updatedAt: now,
        })
        book = applyStatus(book, STATUSES.has(args.status) ? args.status : 'want', now)
        if (book.status === 'read' && args.rating !== undefined) book.rating = clampNumber(args.rating, 0, 5, 0)
        if (started !== undefined) book.startedAt = started
        if (finished !== undefined && book.status === 'read') book.finishedAt = finished || now
        return { books: [book, ...books], result: { action: 'Added', book } }
      })
      const stored = saved.books.find(book => book.id === result.book.id) || result.book
      return { action: result.action, book: bookView(stored, false), revision: saved.revision }
    },
  }), 'bookshelf: tool add')

  ctx.effect(() => tools.register({
    name: 'bookshelf_update',
    description: [
      "Change one book on the user's bookshelf: reading status, page or percent progress, rating, tags, note, dates, author, or page count.",
      'Moving to "reading" stamps the start date and moving to "read" stamps the finish date unless you pass them.',
      'Only call this for changes the user asked for or clearly confirmed.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        book: BOOK_REF,
        status: { type: 'string', enum: STATUS_LIST },
        currentPage: { type: 'integer', description: 'Page the user is on; sets progress from the page count.' },
        progress: { type: 'integer', description: 'Percent 0-100, when pages are unknown.' },
        pages: { type: 'integer', description: 'Total page count.' },
        rating: { type: 'integer', description: '0-5 stars; 0 clears.' },
        author: { type: 'string' },
        note: { type: 'string', description: 'Replaces the whole note.' },
        appendNote: { type: 'string', description: 'Appended to the existing note on a new line.' },
        tags: { ...TAGS_SCHEMA, description: 'Replaces all tags.' },
        addTags: TAGS_SCHEMA,
        removeTags: TAGS_SCHEMA,
        started: { type: 'string', description: 'YYYY-MM-DD, "today", or "" to clear.' },
        finished: { type: 'string', description: 'YYYY-MM-DD, "today", or "" to clear.' },
      },
      required: ['book'],
    },
    output: { schema: WRITE_OUTPUT, render: writeRender },
    presentCall: present('Update bookshelf', 'edit'),
    async execute(args) {
      const started = parseDate(args.started, 'started')
      const finished = parseDate(args.finished, 'finished')
      const { saved, result } = await mutateStore(books => {
        const target = findBook(books, args.book)
        const now = Date.now()
        let book = STATUSES.has(args.status) ? applyStatus(target, args.status, now) : { ...target }
        if (typeof args.author === 'string') book.author = text(args.author, 160)
        if (args.pages !== undefined) book.pages = clampNumber(args.pages, 0, 20000, book.pages)
        if (args.currentPage !== undefined) book.currentPage = clampNumber(args.currentPage, 0, 20000, book.currentPage)
        if (args.progress !== undefined) {
          book.progress = clampNumber(args.progress, 0, 100, book.progress)
          if (args.currentPage === undefined) book.currentPage = 0
        }
        if (args.rating !== undefined) book.rating = clampNumber(args.rating, 0, 5, book.rating)
        if (typeof args.note === 'string') book.note = text(args.note, 4000)
        if (typeof args.appendNote === 'string' && args.appendNote.trim() !== '') {
          book.note = text(book.note === '' ? args.appendNote : `${book.note}\n${args.appendNote}`, 4000)
        }
        if (Array.isArray(args.tags)) book.tags = normalizeTags(args.tags)
        if (Array.isArray(args.addTags)) book.tags = normalizeTags([...book.tags, ...args.addTags])
        if (Array.isArray(args.removeTags)) {
          const drop = new Set(args.removeTags.map(tag => String(tag).replace(/^#/, '').toLocaleLowerCase()))
          book.tags = book.tags.filter(tag => !drop.has(tag.toLocaleLowerCase()))
        }
        if (started !== undefined) book.startedAt = started
        if (finished !== undefined) book.finishedAt = finished
        // Finishing the last page finishes the book.
        if (book.status === 'reading' && book.pages > 0 && book.currentPage >= book.pages && args.status === undefined) {
          book = applyStatus(book, 'read', now)
        }
        book.updatedAt = now
        return {
          books: books.map(item => (item.id === target.id ? book : item)),
          result: { action: 'Updated', book },
        }
      })
      const stored = saved.books.find(book => book.id === result.book.id) || result.book
      return { action: result.action, book: bookView(stored, false), revision: saved.revision }
    },
  }), 'bookshelf: tool update')

  ctx.effect(() => tools.register({
    name: 'bookshelf_add_excerpt',
    description: "Save a passage, quote, or highlight to one book's excerpts on the user's bookshelf, optionally with the page and the user's own comment. Use when the user shares a line they want to keep, or asks you to record a takeaway from a discussion about a book.",
    parameters: {
      type: 'object',
      properties: {
        book: BOOK_REF,
        text: { type: 'string', description: 'The passage or takeaway, verbatim as the user gave it.' },
        page: { type: 'integer' },
        note: { type: 'string', description: "The user's comment on the passage." },
      },
      required: ['book', 'text'],
    },
    output: { schema: WRITE_OUTPUT, render: writeRender },
    presentCall: present('Save excerpt', 'edit'),
    async execute(args) {
      const body = text(args.text, 2000)
      if (body === '') throw new Error('text is required')
      const { saved, result } = await mutateStore(books => {
        const target = findBook(books, args.book)
        if (target.excerpts.length >= MAX_EXCERPTS) throw new Error(`《${target.title}》 already has ${MAX_EXCERPTS} excerpts`)
        const now = Date.now()
        const book = {
          ...target,
          excerpts: [...target.excerpts, {
            id: `ex-${randomUUID()}`,
            text: body,
            page: clampNumber(args.page, 0, 20000, 0),
            note: text(args.note, 600),
            createdAt: now,
          }],
          updatedAt: now,
        }
        return {
          books: books.map(item => (item.id === target.id ? book : item)),
          result: { action: `Saved excerpt #${book.excerpts.length}`, book },
        }
      })
      const stored = saved.books.find(book => book.id === result.book.id) || result.book
      return { action: result.action, book: bookView(stored, false), revision: saved.revision }
    },
  }), 'bookshelf: tool excerpt')

  if (ctx.logger && typeof ctx.logger.info === 'function') {
    ctx.logger.info('bookshelf: registered 5 agent tools (bookshelf_list, bookshelf_stats, bookshelf_add, bookshelf_update, bookshelf_add_excerpt)')
  }
}

export function apply(ctx) {
  const logger = ctx.logger

  ctx.effect(() => ctx.webServer.register(route(ROUTE_STATE, handleState, logger)), 'bookshelf: state route')
  ctx.effect(() => ctx.webServer.register(route(ROUTE_REVISION, handleRevision, logger)), 'bookshelf: revision route')

  // Tools are optional: a profile without the tool runtime still gets the panel.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], registerTools)
  }
}

