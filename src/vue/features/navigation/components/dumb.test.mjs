import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Dumb Components take props and emit events. They may import from `vue` and
// `shared/ui` and nothing else — no store, no service, no bridge, no `window.`.
// This reads every component in the folder and fails when one reaches past that
// line, so the rule survives long after the migration.
const here = dirname(fileURLToPath(import.meta.url));
const components = readdirSync(here).filter((f) => f.endsWith('.vue'));

const IMPORT_RE = /import[^'"]*['"]([^'"]+)['"]/g;

function importsOf(source) {
  const specifiers = [];
  let m;
  while ((m = IMPORT_RE.exec(source)) !== null) specifiers.push(m[1]);
  return specifiers;
}

test('the navigation Feature ships at least one Dumb component', () => {
  assert.ok(components.length > 0, 'expected .vue components under features/navigation/components');
});

for (const file of components) {
  test(`${file} is a Dumb Component`, () => {
    const source = readFileSync(join(here, file), 'utf8');

    assert.ok(!/\bwindow\./.test(source), `${file} touches window.`);

    for (const spec of importsOf(source)) {
      const allowed = spec === 'vue' || spec.includes('/shared/ui/') || spec.startsWith('./');
      assert.ok(allowed, `${file} imports ${spec}, which is neither vue nor a shared/ui primitive`);
      assert.ok(!/store/i.test(spec), `${file} imports a store (${spec})`);
      assert.ok(!/bridge|service/i.test(spec), `${file} imports a service/bridge (${spec})`);
    }
  });
}
