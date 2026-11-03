# DSH notes specific to dsh-bookshelf

General DSH plugin knowledge (install paths, `ctx` services, agent tool format, slots, testing approach) lives in `../../DSH-PLUGIN-NOTES.md`. This file holds only what is particular to this plugin.

- Installed as `"@local/dsh-bookshelf": "link:…"` in `~/.dsh/profiles/desktop/package.json` and listed in `dsh.profile.bundles`; `cordis.patch.yml` here inserts the loader row. Being a `link:`, edits are live: reload the window for `client.js`, restart the app for `index.js`.
- Shelf data: `~/.dsh/storages/bookshelf.json` (override with `DSH_BOOKSHELF_FILE`), document version 2; v1 files are read and upgraded on the next write.
- HTTP: `api/dsh-bookshelf/state` (GET, PUT with `baseRevision`, 409 on a stale base) and `api/dsh-bookshelf/revision` (cheap poll).
- Agent tools: `bookshelf_list`, `bookshelf_stats`, `bookshelf_add`, `bookshelf_update`, `bookshelf_add_excerpt`; registered through `ctx.inject(['tools'], …)` so the panel works without them. On load the plugin logs `bookshelf: registered 5 agent tools …`.
- `normalizeBook`, `applyStatus`, `yearStats`, and `titleKey` exist in both `index.js` and `client.js`; `test/parity.test.mjs` keeps them in step, so change both together.
- `client.js` sections are marked with `/* ── name ─── */`: `grep -n '/\* ──' client.js` lists them.
- Browser check: `dev/harness.mjs` (preview name `bookshelf-harness`).
