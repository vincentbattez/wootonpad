import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const featuresDir = join(root, 'src/vue/features');

// "Dumb" made checkable rather than a matter of taste: every file under a Feature's
// components/ folder is read and must not reach the outside world. A Dumb Component takes
// props and emits events; it may import from `vue` and `shared/` and its own Feature's
// components, and nothing else — no store, no service, no `window.`. The store-backed
// Bridge and the edge Container carry the side effects, which is what lets a panel be a
// Dumb Component at all. The repo already asserts invariants by reading files this way —
// the ten style tests and the icon test do exactly that.

function vueFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vueFiles(p));
    else if (entry.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

// Every components/ folder found beneath features/, one entry per Feature.
function componentDirs() {
  if (!existsSync(featuresDir)) return [];
  const dirs = [];
  for (const feature of readdirSync(featuresDir, { withFileTypes: true })) {
    if (!feature.isDirectory()) continue;
    const componentsDir = join(featuresDir, feature.name, 'components');
    if (existsSync(componentsDir)) dirs.push(componentsDir);
  }
  return dirs;
}

test('a Feature has a components/ folder to police', () => {
  // The sessions pilot exists; this guards the discovery above from silently finding
  // nothing once a Feature is migrated.
  assert.ok(componentDirs().length > 0, 'expected at least one features/*/components/ folder');
});

test('no Dumb Component imports a store or a service, or touches window', () => {
  const offenders = [];
  for (const dir of componentDirs()) {
    for (const file of vueFiles(dir)) {
      const src = readFileSync(file, 'utf8');
      const where = relative(root, file);
      if (/\bwindow\./.test(src)) offenders.push(`${where}: contains window.`);
      if (/from\s+['"][^'"]*\/store(\.js)?['"]/.test(src)) offenders.push(`${where}: imports a store`);
      if (/from\s+['"][^'"]*\/stores\//.test(src)) offenders.push(`${where}: imports a store slice`);
      if (/from\s+['"][^'"]*\/services\//.test(src)) offenders.push(`${where}: imports a service`);
    }
  }
  assert.deepEqual(offenders, [], 'these components reach outside a Dumb Component:\n' + offenders.join('\n'));
});
