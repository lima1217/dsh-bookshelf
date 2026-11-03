import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { DSH_TOOLS_LIB, callTool, hasDshTools, loadHost, request, useTempShelf } from './helpers.mjs'

const STATE = '/api/dsh-bookshelf/state'

test('every tool passes DSH schema validation and returns schema-valid output', { skip: !hasDshTools && 'DSH not installed' }, async () => {
  const { assertSupportedJsonSchema, validateJsonSchemaValue } = await import(DSH_TOOLS_LIB)
  useTempShelf()
  const { tools } = loadHost()
  assert.deepEqual(Object.keys(tools).sort(), ['bookshelf_add', 'bookshelf_add_excerpt', 'bookshelf_list', 'bookshelf_stats', 'bookshelf_update'])
  for (const tool of Object.values(tools)) {
    assertSupportedJsonSchema(tool.parameters)
    assertSupportedJsonSchema(tool.output.schema)
  }
  const calls = [
    ['bookshelf_add', { title: '《置身事内》', author: '兰小欢', status: 'reading', pages: 300, currentPage: 120, tags: ['经济'] }],
    ['bookshelf_update', { book: '置身', currentPage: 300 }],
    ['bookshelf_add_excerpt', { book: '置身事内', text: '一句摘录', page: 3 }],
    ['bookshelf_list', {}],
    ['bookshelf_list', { book: '置身事内' }],
    ['bookshelf_stats', {}],
  ]
  for (const [name, args] of calls) {
    assert.deepEqual(validateJsonSchemaValue(tools[name].parameters, args, ''), [], `${name} args`)
    const out = await callTool(tools, name, args)
    assert.deepEqual(validateJsonSchemaValue(tools[name].output.schema, out, ''), [], `${name} output`)
    assert.equal(typeof tools[name].output.render(args, out)[0].text, 'string')
  }
})

test('tools log their registration', () => {
  const { logs } = loadHost()
  assert.ok(logs.some(line => line.includes('bookshelf: registered 5 agent tools')))
})

test('finishing the last page finishes the book and stamps the date', async () => {
  useTempShelf()
  const { tools } = loadHost()
  await callTool(tools, 'bookshelf_add', { title: 'A', status: 'reading', pages: 10 })
  const out = await callTool(tools, 'bookshelf_update', { book: 'A', currentPage: 10 })
  assert.equal(out.book.status, 'read')
  assert.equal(out.book.progress, 100)
  assert.match(out.book.finished, /^\d{4}-\d{2}-\d{2}$/)
})

test('adding a title already on the shelf returns it unchanged', async () => {
  useTempShelf()
  const { tools } = loadHost()
  const first = await callTool(tools, 'bookshelf_add', { title: '小王子' })
  const again = await callTool(tools, 'bookshelf_add', { title: '《小王子》', status: 'read' })
  assert.equal(again.book.id, first.book.id)
  assert.equal(again.book.status, 'want')
})

test('an ambiguous book reference lists the candidates', async () => {
  useTempShelf()
  const { tools } = loadHost()
  await callTool(tools, 'bookshelf_add', { title: '三体' })
  await callTool(tools, 'bookshelf_add', { title: '三体 II' })
  await assert.rejects(callTool(tools, 'bookshelf_update', { book: '三' }), /matches 2 books/)
})

test('a stale PUT gets 409 with the current shelf; a fresh one bumps the revision', async () => {
  useTempShelf()
  const { routes, tools } = loadHost()
  await callTool(tools, 'bookshelf_add', { title: 'X' })
  const current = await request(routes[STATE], 'GET')
  const stale = await request(routes[STATE], 'PUT', { version: 2, baseRevision: current.body.revision - 1, books: [] })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.books.length, 1)
  const fresh = await request(routes[STATE], 'PUT', { version: 2, baseRevision: current.body.revision, books: current.body.books })
  assert.equal(fresh.status, 200)
  assert.equal(fresh.body.revision, current.body.revision + 1)
})

test('a PUT from an old v1 client is rejected', async () => {
  useTempShelf()
  const { routes } = loadHost()
  const res = await request(routes[STATE], 'PUT', { version: 1, books: [] })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /reload/)
})

test('a v1 shelf file is read and upgraded to v2 on the next write', async () => {
  const file = useTempShelf()
  writeFileSync(file, JSON.stringify({ version: 1, revision: 7, updatedAt: 1, books: [{ id: 'a', title: '旧书', status: 'read', progress: 100, rating: 4, addedAt: 5 }] }))
  const { tools } = loadHost()
  const listed = await callTool(tools, 'bookshelf_list', {})
  assert.equal(listed.total, 1)
  const updated = await callTool(tools, 'bookshelf_update', { book: '旧书', addTags: ['老'] })
  assert.equal(updated.revision, 8)
  assert.deepEqual(updated.book.tags, ['老'])
})
