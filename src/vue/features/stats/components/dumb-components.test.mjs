import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// A Dumb Component takes props and emits events. It may import from `vue` and
// shared UI only — never a store, a service or `window.` — so a component
// importing nothing with side effects is provably safe to render in isolation.
// This reads every file in the Feature's components/ folder and enforces that.

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.vue'));

test('the stats Feature has at least one Dumb component to check', () => {
  assert.ok(files.length > 0, 'expected .vue files under features/stats/components');
});

for (const file of files) {
  test(`${file} imports no store or service and never touches window.`, () => {
    const src = readFileSync(join(here, file), 'utf8');
    assert.doesNotMatch(src, /window\./, 'a Dumb Component must not touch window.');
    assert.doesNotMatch(src, /import\s+[^;]*['"][^'"]*-store(\.js)?['"]/, 'a Dumb Component must not import a store');
    assert.doesNotMatch(src, /import\s+[^;]*['"][^'"]*-service(\.js)?['"]/, 'a Dumb Component must not import a service');
  });
}
