import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// A Dumb Component takes props and emits events. It may import from `vue` and `shared/ui`
// and nothing else — no store, no service, no `window.*`. This reads every component under a
// Feature's `components/` folder and fails when one reaches for behaviour, so "Dumb" is
// checkable rather than a matter of taste. The repo already asserts invariants by reading
// files this way — the style tests do exactly that.

const featuresDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'vue', 'features');

function componentFiles() {
  const files = [];
  let features;
  try {
    features = readdirSync(featuresDir);
  } catch {
    return files;
  }
  for (const feature of features) {
    const componentsDir = join(featuresDir, feature, 'components');
    let entries;
    try {
      entries = readdirSync(componentsDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(componentsDir, entry);
      if (statSync(full).isFile() && entry.endsWith('.vue')) files.push(full);
    }
  }
  return files;
}

const files = componentFiles();

test('a Feature declares at least one Dumb Component', () => {
  assert.ok(files.length > 0, 'no components found under src/vue/features/*/components');
});

for (const file of files) {
  const rel = file.slice(file.indexOf('features/'));
  const source = readFileSync(file, 'utf8');

  test(`${rel} is Dumb: no store or service import`, () => {
    const importPaths = [...source.matchAll(/import\s+[^;]*?from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const p of importPaths) {
      assert.ok(!/store/i.test(p), `imports a store: ${p}`);
      assert.ok(!/\/services\//.test(p), `imports a service: ${p}`);
    }
  });

  test(`${rel} is Dumb: no window.* access`, () => {
    assert.ok(!/\bwindow\./.test(source), 'reaches for window.*');
  });
}
