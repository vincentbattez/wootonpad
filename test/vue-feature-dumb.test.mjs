import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// "Dumb" is checkable, not a matter of taste: every file under a Feature's
// components/ folder takes props and emits events. It may import from `vue` and
// `shared/ui` and nothing else — no store, no service, no `window.*`. This test
// reads each such file and fails when one crosses the line, the same way the
// style tests assert invariants by reading files.

const featuresDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'vue', 'features');

function componentFiles() {
  const files = [];
  let features;
  try {
    features = readdirSync(featuresDir, { withFileTypes: true });
  } catch {
    return files; // no features migrated yet
  }
  for (const feature of features) {
    if (!feature.isDirectory()) continue;
    const componentsDir = join(featuresDir, feature.name, 'components');
    let entries;
    try {
      entries = readdirSync(componentsDir);
    } catch {
      continue; // a Feature need not have Dumb components
    }
    for (const entry of entries) {
      if (!entry.endsWith('.vue')) continue; // colocated tests are not Components
      const full = join(componentsDir, entry);
      if (statSync(full).isFile()) files.push(full);
    }
  }
  return files;
}

const IMPORT_RE = /import\s+[^'"]*from\s*['"]([^'"]+)['"]/g;

test('no Feature Dumb Component imports a store or a service, or touches window', () => {
  const files = componentFiles();
  assert.ok(files.length > 0, 'expected at least one Feature Dumb Component to check');

  for (const file of files) {
    const src = readFileSync(file, 'utf8');

    assert.ok(!/\bwindow\./.test(src), `${file} touches window.*`);

    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1];
      assert.ok(!/(^|\/)store(s)?(\.js|\/|$)/.test(spec), `${file} imports a store: ${spec}`);
      assert.ok(!/(^|\/)service(s)?(\.js|\/|$)/.test(spec), `${file} imports a service: ${spec}`);
      assert.ok(!/(^|\/)bridge(\.js)?$/.test(spec), `${file} imports a bridge: ${spec}`);
    }
  }
});
