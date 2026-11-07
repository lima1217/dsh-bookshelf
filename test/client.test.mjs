import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClient } from './helpers.mjs'

const client = loadClient()

test('mergeShelves keeps both sides and honors deletes only when untouched', () => {
  const book = (id, v, updatedAt = 1) => ({ id, v, updatedAt })
  const base = [book('keep', 1), book('delLocal', 1), book('delRemote', 1), book('bothEdit', 1), book('delLocalEditRemote', 1)]
  const local = [book('keep', 1), book('delRemote', 1), book('bothEdit', 2, 5), book('newLocal', 1)]
  const remote = [book('keep', 1), book('delLocal', 1), book('bothEdit', 3, 9), book('delLocalEditRemote', 2), book('newRemote', 1)]
  const merged = client.mergeShelves(base, local, remote).map(entry => `${entry.id}:${entry.v}`)
  assert.deepEqual(merged, ['newLocal:1', 'keep:1', 'bothEdit:3', 'delLocalEditRemote:2', 'newRemote:1'])
})

test('Goodreads CSV keeps shelf, rating, review, ISBN, and dates', () => {
  const csv = [
    'Book Id,Title,Author,ISBN13,My Rating,Number of Pages,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review',
    '1,"Thinking, Fast and Slow",Daniel Kahneman,"=""9780374275631""",5,499,2026/02/14,2025/12/01,"psychology, read",read,Great<br/>book',
    '2,Dune,Frank Herbert,,0,658,,2026/09/10,currently-reading,currently-reading,',
  ].join('\n')
  const [tfs, dune] = client.parseImport(csv, 'goodreads.csv')
  assert.equal(tfs.title, 'Thinking, Fast and Slow')
  assert.equal(tfs.status, 'read')
  assert.equal(tfs.rating, 5)
  assert.equal(tfs.isbn, '9780374275631')
  assert.equal(tfs.note, 'Great\nbook')
  assert.deepEqual(tfs.tags, ['psychology'])
  assert.equal(new Date(tfs.finishedAt).getDate(), 14)
  assert.equal(dune.status, 'reading')
})

test('Douban CSV maps 力荐, 读过 mark time, and 在读 start', () => {
  const csv = [
    '标题,作者,页数,我的评分,我的标签,我的短评,标记时间,状态',
    '三体,刘慈欣,302,力荐,科幻 刘慈欣,好看,2026-07-08 21:03:11,读过',
    '活着,余华,191,4,小说,,2026-08-01 10:00:00,在读',
  ].join('\n')
  const [santi, huozhe] = client.parseImport(csv, 'douban.csv')
  assert.equal(santi.rating, 5)
  assert.equal(santi.status, 'read')
  assert.equal(new Date(santi.finishedAt).getMonth(), 6)
  assert.deepEqual(santi.tags, ['科幻', '刘慈欣'])
  assert.equal(new Date(huozhe.startedAt).getMonth(), 7)
})

test('the CSV export imports back losslessly', () => {
  const books = [client.normalizeBook({
    id: 'a', title: 'Title, with comma', author: 'A "quoted" name', status: 'read', rating: 4,
    tags: ['x', 'y'], note: 'line1\nline2', startedAt: Date.UTC(2026, 0, 2, 12), finishedAt: Date.UTC(2026, 1, 3, 12),
    excerpts: [{ text: 'passage', page: 7, note: '' }], pages: 200, addedAt: Date.UTC(2025, 11, 1, 12),
  })]
  const [back] = client.parseImport(client.exportCsv(books).replace(/^﻿/, ''), 'export.csv')
  for (const key of ['title', 'author', 'status', 'rating', 'note', 'pages']) assert.equal(back[key], books[0][key], key)
  assert.deepEqual(back.tags, ['x', 'y'])
  assert.equal(back.excerpts[0].text, 'passage')
})

test('a first-time user starts with an empty shelf, not sample books', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(client.loadLocalBooks())), [])
})

test('counts use the locale’s plural rule and digit grouping', () => {
  const tt = (key, params) => ({ 'book.excerpts': '{count} quotes', 'book.excerptsOne': '{count} quote' })[key].replace('{count}', params.count)
  assert.equal(client.plural(tt, 1, 'book.excerpts', 'book.excerptsOne', 'en-US'), '1 quote')
  assert.equal(client.plural(tt, 2, 'book.excerpts', 'book.excerptsOne', 'en-US'), '2 quotes')
  assert.equal(client.plural(tt, 0, 'book.excerpts', 'book.excerptsOne', 'en-US'), '0 quotes')
  assert.equal(client.formatNumber(2445, 'en-US'), '2,445')
  assert.equal(client.formatNumber(0.52, 'zh-CN', { style: 'percent' }), '52%')
})
