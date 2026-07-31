import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEditorMode } from '../public/cm-theme.mjs';

test('a light resolved appearance opens the editor in light mode', () => {
  assert.equal(resolveEditorMode({ mode: 'light' }), 'light');
});

test('a dark resolved appearance opens the editor in dark mode', () => {
  assert.equal(resolveEditorMode({ mode: 'dark' }), 'dark');
});

test('a missing appearance falls back to dark, so there is no flash before it lands', () => {
  assert.equal(resolveEditorMode(undefined), 'dark');
  assert.equal(resolveEditorMode(null), 'dark');
  assert.equal(resolveEditorMode({}), 'dark');
});

test('an unrecognised mode falls back to dark rather than throwing', () => {
  assert.equal(resolveEditorMode({ mode: 'system' }), 'dark');
  assert.equal(resolveEditorMode({ mode: '' }), 'dark');
});
