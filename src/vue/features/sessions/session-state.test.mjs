import test from 'node:test';
import assert from 'node:assert/strict';

import { sessionStateFor, stateDotClass, isTerminalLike, SESSION_STATES } from './session-state.mjs';

// The State Dot's whole contract: one enum value for a set of signals, and a precedence
// that is readable here rather than reconstructed from the stylesheet.

test('each signal on its own produces its state', () => {
  assert.equal(sessionStateFor({ isBusy: true }), 'working');
  assert.equal(sessionStateFor({ isAttention: true }), 'needsInput');
  assert.equal(sessionStateFor({ done: true }), 'done');
  assert.equal(sessionStateFor({}), 'sleeping');
});

test('no signal at all is sleeping', () => {
  assert.equal(sessionStateFor(), 'sleeping');
  assert.equal(sessionStateFor({ type: 'session' }), 'sleeping');
  assert.equal(sessionStateFor({ isBusy: false, isAttention: false, done: 0 }), 'sleeping');
});

test('busy wins over attention', () => {
  assert.equal(sessionStateFor({ isBusy: true, isAttention: true }), 'working');
});

test('busy lifts a stale done', () => {
  assert.equal(sessionStateFor({ done: true, isBusy: true }), 'working');
});

test('attention wins over done', () => {
  assert.equal(sessionStateFor({ done: true, isAttention: true }), 'needsInput');
});

test('done with no other signal stays done', () => {
  assert.equal(sessionStateFor({ done: true, isBusy: false, isAttention: false }), 'done');
});

// A live PTY is not a Session State input at all: it is absent from the contract, so a caller
// cannot colour the dot with it even by mistake. Asserted on the signature rather than by
// passing an `isRunning` key — an ignored key would make any such test pass vacuously. What a
// live PTY does to a *row* is covered where activePtyIds actually exists, in session-list.test.mjs.
test('a live PTY is not part of the contract — the four signals are the whole of it', () => {
  const signals = String(sessionStateFor).match(/\{([^}]*)\}/)[1];
  const named = signals.split(',').map(p => p.trim().split(/[=:\s]/)[0]).filter(Boolean);
  assert.deepEqual(named.sort(), ['done', 'isAttention', 'isBusy', 'type']);
});

test('every state the module can return is one of the four', () => {
  const combos = [{}, { isBusy: true }, { isAttention: true }, { done: true }];
  for (const c of combos) assert.ok(SESSION_STATES.includes(sessionStateFor(c)));
});

test('a terminal-like row has no Session State whatever the signals', () => {
  for (const type of ['terminal', 'run-terminal']) {
    assert.equal(sessionStateFor({ type }), null);
    assert.equal(sessionStateFor({ type, isBusy: true }), null);
    assert.equal(sessionStateFor({ type, isAttention: true }), null);
    assert.equal(sessionStateFor({ type, done: true }), null);
    assert.equal(sessionStateFor({ type, isBusy: true, isAttention: true, done: true }), null);
  }
});

test('every state maps to exactly one dot class, and nothing else does', () => {
  const classes = SESSION_STATES.map(stateDotClass);
  assert.equal(new Set(classes).size, SESSION_STATES.length);
  for (const c of classes) assert.match(c, /^session-state-dot--[a-z-]+$/);
  assert.equal(stateDotClass(null), null);
  assert.equal(stateDotClass('running'), null);
});

test('isTerminalLike answers for both kinds of Terminal and nothing else', () => {
  assert.equal(isTerminalLike({ type: 'terminal' }), true);
  assert.equal(isTerminalLike({ type: 'run-terminal' }), true);
  assert.equal(isTerminalLike({ type: 'session' }), false);
  assert.equal(isTerminalLike({}), false);
  assert.equal(isTerminalLike(null), false);
});
