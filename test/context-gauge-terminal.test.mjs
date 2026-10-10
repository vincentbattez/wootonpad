import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { gaugeState } from '../src/vue/features/sessions/context-gauge.mjs';

// VIN-149 — the acceptance criterion "Un Plain Terminal et un Run Terminal n'affichent aucune
// jauge." gaugeState is pure and knows only usage+working, so the terminal gate lives in
// SessionItem.vue: a terminal-like row must never be handed `working: true`, or a build emitting
// OSC 9;4 progress (or a spinner char in a Plain Terminal's title) would flip it busy and render
// the empty "measuring" track — a gauge the spec forbids on those rows.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('gaugeState shows the measuring track only for a working session with no value', () => {
  // The state machine itself: a working row with no usage measures; a resting one shows nothing.
  assert.equal(gaugeState(null, true), 'track');
  assert.equal(gaugeState(null, false), 'none');
  assert.equal(gaugeState({ inputTokens: 10 }, false), 'gauge');
});

test('SessionItem gates the gauge\'s working prop on the row not being terminal-like', () => {
  const item = readFileSync(
    join(root, 'src', 'vue', 'features', 'sessions', 'components', 'SessionItem.vue'),
    'utf8',
  );
  // A busy terminal/run-terminal row must resolve `working` to false, so gaugeState returns
  // 'none' (no usage + not working) and the row shows no gauge.
  assert.match(
    item,
    /:working="isBusy && !isTerminalLike"/,
    'the gauge\'s working prop must exclude terminal-like rows so a busy terminal shows no gauge',
  );
});
