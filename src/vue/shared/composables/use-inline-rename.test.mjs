import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useInlineRename } from './use-inline-rename.js';

// The inline-rename composable owns the editing flag and the draft, and hands the trimmed
// value (or null) to its onSubmit. These pin the behaviour the SbEditableLabel primitive drives.

test('start opens editing and seeds the draft', () => {
  const r = useInlineRename(() => {});
  r.start('hello');
  assert.equal(r.editing.value, true);
  assert.equal(r.draft.value, 'hello');
});

test('start tolerates a missing initial value', () => {
  const r = useInlineRename(() => {});
  r.start();
  assert.equal(r.draft.value, '');
});

test('submit trims and closes editing', () => {
  let got;
  const r = useInlineRename((name) => { got = name; });
  r.start('old');
  r.submit('  new name  ');
  assert.equal(got, 'new name');
  assert.equal(r.editing.value, false);
});

test('submit sends null when the field is cleared', () => {
  let got = 'unset';
  const r = useInlineRename((name) => { got = name; });
  r.start('old');
  r.submit('   ');
  assert.equal(got, null);
});

test('submit falls back to the draft when given no value', () => {
  let got;
  const r = useInlineRename((name) => { got = name; });
  r.start('drafted');
  r.submit();
  assert.equal(got, 'drafted');
});

test('cancel closes editing without submitting', () => {
  let called = false;
  const r = useInlineRename(() => { called = true; });
  r.start('old');
  r.cancel();
  assert.equal(r.editing.value, false);
  assert.equal(called, false);
});

test('submit after cancel is inert', () => {
  let calls = 0;
  const r = useInlineRename(() => { calls++; });
  r.start('old');
  r.cancel();
  r.submit('late');
  assert.equal(calls, 0);
});
