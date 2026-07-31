import test from 'node:test';
import assert from 'node:assert/strict';

import { avatarFromName, avatarFromPath, AVATAR_COLORS } from '../src/vue/avatar.mjs';

// The initials-and-colour fallback is generalised from a filesystem path (Project) to a free-form
// display name (Area). These cases pin the shared derivation so both callers stay in step.

test('two words give the two leading initials, upper-cased', () => {
  assert.equal(avatarFromName('RAR Drop Studio').initials, 'RD');
});

test('a single word gives its first two letters, upper-cased', () => {
  assert.equal(avatarFromName('commerce').initials, 'CO');
});

test('separators (dash, underscore, dot) split into words', () => {
  assert.equal(avatarFromName('my-cool_project').initials, 'MC');
});

test('a camelCase word splits on the case boundary', () => {
  assert.equal(avatarFromName('camelCase').initials, 'CC');
});

test('an empty name falls back to a question mark', () => {
  assert.equal(avatarFromName('').initials, '?');
  assert.equal(avatarFromName(null).initials, '?');
});

test('the colour is a member of the palette and deterministic', () => {
  const first = avatarFromName('Norauto');
  assert.ok(AVATAR_COLORS.includes(first.color));
  assert.equal(first.color, avatarFromName('Norauto').color);
});

test('different names generally land on different colours', () => {
  // Not a guarantee for every pair, but these three chosen names must differ.
  const a = avatarFromName('Norauto').color;
  const b = avatarFromName('Commerce').color;
  assert.notEqual(a, b);
});

test('avatarFromPath derives the name from the last path segment', () => {
  assert.deepEqual(avatarFromPath('/Users/me/lab/norauto/site'), avatarFromName('site'));
});

test('avatarFromPath ignores a trailing slash', () => {
  assert.deepEqual(avatarFromPath('/a/b/my-app/'), avatarFromName('my-app'));
});
