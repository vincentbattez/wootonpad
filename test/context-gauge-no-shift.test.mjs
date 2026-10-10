import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// VIN-149 — two invariants a linter would catch, asserted here by reading the files (the same
// shape the style and dumb-component tests use):
//  1. Every CSS class the gauge invents has a rule in the global sheet — a class born in the
//     component with no rule is a styling decision escaping public/style.css (CODING_STANDARDS,
//     ADR 0008). The empty "measuring" track's modifier must render an actual tinted track.
//  2. The measuring track reserves the label's slot, so the first value's arrival fills it
//     instead of widening the row and shifting the line.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gauge = readFileSync(
  join(root, 'src', 'vue', 'features', 'sessions', 'components', 'SessionContextGauge.vue'),
  'utf8',
);
const styleCss = readFileSync(join(root, 'public', 'style.css'), 'utf8');

test('every session-context class the gauge renders has a rule in the global sheet', () => {
  // The literal classes the component writes onto its markup (class="…"), split into tokens.
  const classAttrs = [...gauge.matchAll(/\bclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
  const invented = [...new Set(classAttrs)].filter((c) => c.startsWith('session-context'));
  assert.ok(invented.includes('session-context-meter--empty'), 'the empty-track modifier is rendered');
  for (const cls of invented) {
    assert.match(
      styleCss,
      new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}[\\s,{]`),
      `class "${cls}" is invented in the component but has no rule in public/style.css`,
    );
  }
});

test('the empty measuring track is tinted, not a bare zero bar', () => {
  // A rule that only names the selector with no declaration would satisfy "has a rule" while
  // leaving the promised tint absent; assert the track actually carries a background token.
  assert.match(
    styleCss,
    /\.session-context-meter--empty\s*\{[^}]*background:\s*var\(--[^)]+\)/,
    'the empty measuring track must carry a background token so it reads as tinted',
  );
});

test('the measuring track reserves the label slot so the first value does not shift the line', () => {
  // Both gauge states render a .session-context-label, so the slot is present while measuring.
  const labels = gauge.match(/session-context-label/g) || [];
  assert.ok(labels.length >= 2, 'the measuring state must render a label placeholder too');
  // …and the compact row reserves that slot a fixed width, so track and gauge occupy the same
  // space and margin-left:auto has nothing to grow into when the value arrives.
  assert.match(
    styleCss,
    /\.session-context--compact\s+\.session-context-label\s*\{[^}]*min-width:/,
    'the compact label must reserve a min-width so the first value fills it rather than widening the row',
  );
});
