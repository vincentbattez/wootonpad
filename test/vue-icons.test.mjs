import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as icons from '../src/vue/shared/lib/icons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The icon strings once inlined in the components now live in one shared library, so a
// row reads without scrolling past SVG path data. These assert the strings are in the
// library and out of the components — and that the frozen legacy renderer keeps its own.

test('every exported icon set is an object of svg strings', () => {
  let total = 0;
  for (const [group, set] of Object.entries(icons)) {
    assert.equal(typeof set, 'object', group);
    for (const [name, svg] of Object.entries(set)) {
      assert.match(svg, /^<svg[\s\S]*<\/svg>$/, `${group}.${name}`);
      total++;
    }
  }
  assert.ok(total > 40, `expected the whole icon set, saw ${total}`);
});

function vueFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vueFiles(p));
    else if (entry.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

test('no Vue component inlines an <svg — icons come from the shared library', () => {
  const offenders = [];
  for (const file of vueFiles(join(root, 'src/vue'))) {
    const src = readFileSync(file, 'utf8');
    if (/['"]<svg/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'these still inline an SVG string');
});

test('window.ICONS stays in the frozen legacy renderer', () => {
  const legacy = readFileSync(join(root, 'public/icons.js'), 'utf8');
  assert.match(legacy, /window\.ICONS\s*=/, 'the legacy renderer keeps its own icon registry');
});
