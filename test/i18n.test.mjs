import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientSource, loadClient } from './helpers.mjs'

const { zh, en } = loadClient()

/** Every `'group.key'` literal outside the dictionaries is a translation lookup. */
function usedKeys() {
  const start = clientSource.indexOf('const zh = {')
  const end = clientSource.indexOf('/* ── icons')
  const code = clientSource.slice(0, start) + clientSource.slice(end)
  const keys = new Set()
  for (const match of code.matchAll(/'([a-z]+\.[a-zA-Z]+)'/g)) {
    if (match[1].split('.')[0] in GROUPS) keys.add(match[1])
  }
  return keys
}

const GROUPS = Object.fromEntries(Object.keys(zh).map(key => [key.split('.')[0], true]))

test('zh and en define the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('every key the UI looks up exists in both dictionaries', () => {
  const missing = [...usedKeys()].filter(key => !(key in zh) || !(key in en))
  assert.deepEqual(missing, [])
})

test('every dictionary key is still used somewhere', () => {
  const used = usedKeys()
  const unused = Object.keys(zh).filter(key => !used.has(key))
  assert.deepEqual(unused, [])
})
