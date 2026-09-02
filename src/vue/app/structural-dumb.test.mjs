import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The whole-tree structural check for ADR 0008: a Dumb Component takes props and
// emits events. It may lean on Vue, shared UI, shared composables, shared icons and
// its Feature's own icon/display helpers — but never a store, a service or a Bridge,
// and never `window.*`. That is the line that keeps a component provably safe to
// render in isolation. This reads every `.vue` file living under any `components/`
// folder in the Vue tree, so the rule holds across every Feature at once rather than
// one folder at a time, and survives long after the migration that introduced it.

const vueRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Walk the tree collecting every .vue file whose path sits inside a `components/`
// folder — Dumb Components live there and nowhere else (Containers, Pages and Views
// are held to a different, looser rule).
function collectDumbComponents(dir, inComponents, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectDumbComponents(full, inComponents || entry === 'components', out);
    } else if (inComponents && entry.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

const components = collectDumbComponents(vueRoot, false, []);

const IMPORT_RE = /import[^'"]*['"]([^'"]+)['"]/g;
function importsOf(source) {
  const specifiers = [];
  let m;
  while ((m = IMPORT_RE.exec(source)) !== null) specifiers.push(m[1]);
  return specifiers;
}

test('the Vue tree ships Dumb Components to check', () => {
  assert.ok(components.length > 0, 'expected .vue files under some components/ folder');
});

for (const file of components) {
  const rel = file.slice(vueRoot.length + 1);
  test(`${rel} is a Dumb Component`, () => {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/\bwindow\./.test(source), `${rel} touches window.`);
    for (const spec of importsOf(source)) {
      assert.ok(!/store/i.test(spec), `${rel} imports a store (${spec})`);
      assert.ok(!/service/i.test(spec), `${rel} imports a service (${spec})`);
      assert.ok(!/bridge/i.test(spec), `${rel} imports a bridge (${spec})`);
    }
  });
}
