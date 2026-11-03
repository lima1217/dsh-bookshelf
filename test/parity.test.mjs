/**
 * index.js and client.js each carry their own normalizeBook / applyStatus /
 * yearStats (the client cannot import the Host module). These tests run the
 * same fixtures through both halves so the copies cannot drift apart.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callTool, loadClient, loadHost, request, useTempShelf } from './helpers.mjs'

const client = loadClient()
const STATE = '/api/dsh-bookshelf/state'
const DAY = 86400000
const year = new Date().getFullYear()
const at = (month, day) => new Date(year, month, day, 12).getTime()

const FIXTURES = [
  { id: 'a', title: '  Paged  ', status: 'reading', pages: 400, currentPage: 100, progress: 3, addedAt: at(0, 1), updatedAt: at(0, 2), startedAt: at(0, 1) },
  { id: 'b', title: 'Read', status: 'read', progress: 20, rating: 9, tags: ['#x', 'X', 'y'], finishedAt: at(2, 5), startedAt: at(1, 20), pages: 250, addedAt: at(0, 1), updatedAt: at(2, 5) },
  { id: 'c', title: 'Want', status: 'want', finishedAt: at(1, 1), note: 'n'.repeat(5000), description: 'd'.repeat(3000), author: 'a'.repeat(300), excerpts: [{ id: 'e1', text: ' quote ', page: 4, note: '', createdAt: at(0, 3) }, { text: '' }], addedAt: at(0, 4), updatedAt: at(0, 4) },
  { id: 'd', title: 'Bad status', status: 'nope', cover: 'http://img.example/x.jpg', addedAt: at(0, 5), updatedAt: at(0, 5) },
  { id: 'e', title: 'Also read', status: 'read', rating: 3, tags: ['y'], finishedAt: at(5, 9), pages: 100, addedAt: at(0, 6), updatedAt: at(5, 9) },
]

test('normalizeBook: the Host stores exactly what the client normalizes', async () => {
  useTempShelf()
  const { routes } = loadHost()
  const saved = await request(routes[STATE], 'PUT', { version: 2, baseRevision: 0, books: FIXTURES })
  assert.equal(saved.status, 200)
  const local = FIXTURES.map(client.normalizeBook)
  assert.deepEqual(JSON.parse(JSON.stringify(saved.body.books)), JSON.parse(JSON.stringify(local)))
})

test('applyStatus: both halves stamp and clear the same fields', async () => {
  useTempShelf()
  const { tools } = loadHost()
  for (const [from, to] of [['want', 'reading'], ['reading', 'read'], ['read', 'want'], ['read', 'reading']]) {
    const title = `${from}-${to}`
    await callTool(tools, 'bookshelf_add', { title, status: from })
    const host = (await callTool(tools, 'bookshelf_update', { book: title, status: to })).book
    const base = client.normalizeBook({ title, status: 'want' })
    const now = Date.now()
    const local = client.applyStatus(from === 'want' ? base : client.applyStatus(base, from, now - DAY), to, now)
    assert.equal(host.status, local.status, title)
    assert.equal(host.progress, local.progress, title)
    assert.equal(Boolean(host.started), local.startedAt > 0, `${title} started`)
    assert.equal(Boolean(host.finished), local.finishedAt > 0, `${title} finished`)
  }
})

test('yearStats: the stats tool and the stats dialog agree', async () => {
  useTempShelf()
  const { routes, tools } = loadHost()
  await request(routes[STATE], 'PUT', { version: 2, baseRevision: 0, books: FIXTURES })
  const host = await callTool(tools, 'bookshelf_stats', { year })
  const local = client.yearStats(FIXTURES.map(client.normalizeBook), year)
  assert.equal(host.finished, local.finished.length)
  assert.equal(host.pagesFinished, local.pages)
  assert.equal(host.averageRating, local.averageRating)
  assert.equal(host.averageDays, local.averageDays)
  assert.deepEqual(host.byMonth, local.byMonth)
})
