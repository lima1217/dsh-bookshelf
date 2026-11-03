# DSH plugin API, as this plugin uses it

Facts about DeepSeek Harness (DSH) that are not in this repo and took digging to find. Verified against DSH as installed on 2026-11-03.

## Where DSH lives

- Packages: `~/.nvm/versions/node/v26.12.1/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`. The symlinks under `~/.dsh/profiles/node_modules/@deepseek-ai` point at an nvm version that no longer exists; read the path above instead.
- The desktop app runs its own copy from `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`, with profile `~/.dsh/profiles/desktop`.
- This repo is linked into that profile: `~/.dsh/profiles/desktop/package.json` has `"@local/dsh-bookshelf": "link:…/dsh-bookshelf"`. Node resolves imports from the real path, so a bare `import '@deepseek-ai/…'` from `index.js` fails. Talk to DSH only through `ctx`.
- Shelf data: `~/.dsh/storages/bookshelf.json` (override with `DSH_BOOKSHELF_FILE`).

## Reloading changes

- `client.js` changes: reload the bookshelf window.
- `index.js` changes: restart the desktop app. The user's running app is theirs; ask before restarting it, and verify with `dev/harness.mjs` instead.

## Host half (`index.js`)

- Exports `name`, `inject`, `apply(ctx)`. `inject` lists required services; a missing one stops the whole plugin.
- Optional service: `ctx.inject(['tools'], ctx => …)` runs the callback once `tools` exists, so the web route works without it.
- HTTP: `ctx.webServer.register({ kind: 'exact', path, handler(req, res) })` inside `ctx.effect(() => …)`.
- Agent tools: `ctx.tools.register(definition)` takes a plain object. `defineTool` from `@deepseek-ai/dsh-tools` is a typed wrapper around the same shape and is not importable here (see above).
  - `parameters` and `output.schema` are JSON Schema restricted to `type / oneOf / properties / required / additionalProperties / items / enum / const` plus annotations (`description`, `title`, `default`). No `minimum`, `maxLength`, `pattern`: validate ranges in `execute`.
  - `output.render(args, value)` returns `[{ type: 'text', text }]`, the model-facing result.
  - `execute(args, exec)` returns the value; `exec.signal` is the abort signal, `exec.agent` the calling agent.
  - Optional: `presentCall(args)` → `{ card: 'generic', title, kind: 'read' | 'edit', rawInput }` for the chat card; `isConcurrencySafe(args)` for read-only tools.
  - Reference implementation: `dsh-tool-todo/lib/index.js` in the packages dir.
- `test/host.test.mjs` validates every tool against DSH's own validator (`dsh-tools/lib/index.js`, path overridable with `DSH_TOOLS_LIB`).

## Browser half (`client.js`)

- One script calling `window.__ModuleLoader__.load({ id, factory })`; `factory(require)` returns `{ inject, apply(ctx) }`. Only `require('react')` is available. Splitting into several files would need a bundling step, so the file stays single.
- Services used: `ctx.slots` (sidebar entry + `main` panel) and `ctx.locale` (dictionaries registered as `{ zh, en }`).
- Theme colors come from `--dsw-alias-*` CSS variables; `dev/harness.mjs` defines a light set.
- Sections are marked with `/* ── name ─── */` comments: `grep -n '/\* ──' client.js` lists them.

## Logs

- `ctx.logger` output does not land in `~/.dsh/logs`; `~/.dsh/profiles/desktop/.plugin-manager/logs/` holds install logs only. Where runtime plugin logs go is still unverified. On load the plugin logs `bookshelf: registered 5 agent tools …`; when you find it, record the location here.
