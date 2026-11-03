/**
 * Loads both halves of the plugin for tests: the Host half through `apply()`
 * with a fake ctx, the browser half in a vm through its test hook.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import vm from 'node:vm'

const ROOT = new URL('..', import.meta.url).pathname

/** DSH's own tool-schema validator; tests that need it skip when DSH is not installed. */
export const DSH_TOOLS_LIB = process.env.DSH_TOOLS_LIB ||
  `${process.env.HOME}/.nvm/versions/node/v26.12.1/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js`
export const hasDshTools = existsSync(DSH_TOOLS_LIB)

export const clientSource = readFileSync(join(ROOT, 'client.js'), 'utf8')

export function loadClient() {
  const hook = {}
  const React = { createElement: () => null }
  const context = {
    __DSH_BOOKSHELF_TEST__: hook,
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          factory(name => {
            if (name === 'react') return React
            throw new Error(`unexpected require: ${name}`)
          })
        },
      },
    },
    crypto: globalThis.crypto,
    Intl,
  }
  context.globalThis = context
  vm.runInNewContext(clientSource, context, { filename: 'client.js' })
  // Copy results out of the vm realm so strict deep-equality compares values, not prototypes.
  const realm = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)))
  return Object.fromEntries(Object.entries(hook).map(([key, value]) => [
    key,
    typeof value === 'function' ? (...args) => realm(value(...args)) : realm(value),
  ]))
}

/** A fresh shelf file per call; the Host reads the path on every request. */
export function useTempShelf() {
  const file = join(mkdtempSync(join(tmpdir(), 'bookshelf-test-')), 'bookshelf.json')
  process.env.DSH_BOOKSHELF_FILE = file
  return file
}

const plugin = await import(join(ROOT, 'index.js'))

export function loadHost() {
  const routes = {}
  const tools = {}
  const logs = []
  const ctx = {
    logger: { info: message => logs.push(message), error: message => logs.push(message) },
    effect: fn => fn(),
    webServer: { register: route => { routes[route.path] = route; return () => {} } },
  }
  ctx.inject = (deps, callback) => callback({
    ...ctx,
    tools: { register: tool => { tools[tool.name] = tool; return () => {} } },
  })
  plugin.apply(ctx)
  return { routes, tools, logs }
}

/** Run one route request; resolves to `{ status, body }` with the body parsed as JSON. */
export async function request(route, method, body) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  req.method = method
  req.headers = { host: '127.0.0.1:1234' }
  req.socket = { remoteAddress: '127.0.0.1' }
  req.setEncoding = () => {}
  const res = {
    status: 0,
    text: '',
    writeHead(status) { res.status = status },
    end(text) { res.text = text },
  }
  await route.handler(req, res)
  return { status: res.status, body: JSON.parse(res.text) }
}

export async function callTool(tools, name, args) {
  return tools[name].execute(args, {})
}
