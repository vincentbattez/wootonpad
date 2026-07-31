# Coding Standards

Full context: `CLAUDE.md` (architecture, commands), `CONTEXT.md` (domain vocabulary), `docs/adr/` (decisions).

## Style

- Plain JavaScript, no TypeScript. Main process is CommonJS (`require`); `src/vue/` is ESM.
- A pure module imported by both the Vue build and `node --test` must use the `.mjs` extension.
- 2-space indent, single quotes, semicolons — match the file you are editing.
- Comments only when the intent is non-obvious. One line, no redundant restatement of the code.
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`.

## Testing

- `node:test` + `node:assert/strict` only. No Jest, Mocha, Vitest, or component-test framework.
- Tests live in `test/` and are black-box: import the module's exported functions, assert on returned values.
- Never touch SQLite, the filesystem under `~/.claude`, Electron, or the DOM from a test.
- Prior art to imitate: `test/folder-index-state.test.js`, `test/project-collapse.test.mjs`.

## Architecture

- Decision-bearing logic goes in a pure module free of I/O, DOM and Electron; the component only wires it.
- Main process owns all filesystem, SQLite and PTY access; the renderer reaches it only through
  `window.api`, and every IPC channel must be declared in `preload.js`.
- SQLite schema changes are additive migrations in `db.js`. Do not rewrite existing tables.
- Keep the renderer free of `require` — it only has what the preload bridge exposes.
