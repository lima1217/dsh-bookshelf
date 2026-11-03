/**
 * dsh-bookshelf — host half.
 *
 * Owns the durable shelf: one JSON document under the DSH storage directory,
 * exposed to the browser half over a loopback-only, same-origin HTTP route.
 * The Client keeps a localStorage copy as an instant cache and one-time
 * migration source; the Host file is authoritative.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-bookshelf'
export const inject = ['webServer']

const ROUTE_STATE = '/api/dsh-bookshelf/state'
const STORE_VERSION = 1
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_BOOKS = 500
const STATUSES = new Set(['want', 'reading', 'read'])
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
function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function text(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').trim().slice(0, max)
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return ''
  const url = value.trim().replace(/^http:\/\//i, 'https://')
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url.slice(0, 600) : ''
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
  const addedAt = Number(raw.addedAt)
  const updatedAt = Number(raw.updatedAt)
  return {
    id: text(raw.id, 120) || `book-${randomUUID()}`,
    title,
    author: text(raw.author, 160),
    status,
    progress: clampNumber(raw.progress, 0, 100, status === 'read' ? 100 : 0),
    rating: clampNumber(raw.rating, 0, 5, 0),
    note: text(raw.note, 1200),
    addedAt: Number.isFinite(addedAt) && addedAt > 0 ? addedAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
    cover: safeImageUrl(raw.cover),
    description: text(raw.description, 2000),
    publisher: text(raw.publisher, 160),
    published: text(raw.published, 16),
    pages: clampNumber(raw.pages, 0, 20000, 0),
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
  if (parsed === null || typeof parsed !== 'object' || parsed.version !== STORE_VERSION || !Array.isArray(parsed.books)) {
    throw httpError(500, 'bookshelf.json has an unsupported shape; the file was left untouched')
  }
  return {
    revision: Number.isSafeInteger(parsed.revision) ? parsed.revision : 0,
    updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    books: normalizeBooks(parsed.books),
  }
}

/** Atomically replace the document, incrementing its revision. */
async function writeStore(books) {
  const current = await readStore()
  const next = {
    version: STORE_VERSION,
    revision: (current === null ? 0 : current.revision) + 1,
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

/** Serialize writes so two browser windows cannot interleave a read/modify/write. */
let writeChain = Promise.resolve()
function serializedWrite(operation) {
  const run = writeChain.then(operation, operation)
  writeChain = run.then(() => undefined, () => undefined)
  return run
}

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

export function apply(ctx) {
  const logger = ctx.logger

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_STATE,
    async handler(request, response) {
      if (!isLoopbackRequest(request)) {
        writeJson(response, 403, { error: 'forbidden: loopback-only' })
        return
      }
      try {
        if (request.method === 'GET') {
          const store = await readStore()
          writeJson(response, 200, {
            ok: true,
            revision: store === null ? 0 : store.revision,
            updatedAt: store === null ? 0 : store.updatedAt,
            books: store === null ? null : store.books,
          })
          return
        }
        if (request.method === 'PUT') {
          const body = await readJsonBody(request)
          if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            throw httpError(400, 'request body must be an object')
          }
          if (body.version !== STORE_VERSION) {
            throw httpError(400, `unsupported store version: ${String(body.version)}`)
          }
          const books = normalizeBooks(body.books)
          const saved = await serializedWrite(() => writeStore(books))
          writeJson(response, 200, {
            ok: true,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
            books: saved.books,
          })
          return
        }
        response.writeHead(405, { ...JSON_HEADERS, allow: 'GET, PUT' })
        response.end(JSON.stringify({ error: `method not allowed: ${request.method}` }))
      } catch (error) {
        const status = error && Number.isInteger(error.status) ? error.status : 500
        if (status >= 500 && logger && typeof logger.error === 'function') {
          logger.error(`bookshelf: state request failed: ${error instanceof Error ? error.message : String(error)}`)
        }
        writeJson(response, status, {
          error: error instanceof Error ? error.message : 'bookshelf storage failed',
        })
      }
    },
  }), 'bookshelf: state route')
}
