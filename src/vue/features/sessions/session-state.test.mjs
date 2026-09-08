import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionStateFor } from './session-state.mjs';

// The State Dot renders one thing: the Session State, one value of four at a time.
// Precedence, in order: working > needsInput > done > sleeping. `isRunning` (a live PTY)
// is deliberately NOT a signal — a process being alive is not work in progress.

test('each signal alone produces its state', () => {
  assert.equal(sessionStateFor({ isBusy: true }), 'working');
  assert.equal(sessionStateFor({ isAttention: true }), 'needsInput');
  assert.equal(sessionStateFor({ done: true }), 'done');
  assert.equal(sessionStateFor({}), 'sleeping');
});

test('working outranks every other signal', () => {
  assert.equal(sessionStateFor({ isBusy: true, isAttention: true }), 'working');
  assert.equal(sessionStateFor({ isBusy: true, done: true }), 'working');
  assert.equal(sessionStateFor({ isBusy: true, isAttention: true, done: true }), 'working');
});

test('needsInput outranks done', () => {
  assert.equal(sessionStateFor({ isAttention: true, done: true }), 'needsInput');
});

test('done with no live signal stays done', () => {
  assert.equal(sessionStateFor({ done: true, isBusy: false, isAttention: false }), 'done');
});

test('no signal at all is sleeping', () => {
  assert.equal(sessionStateFor({ done: false, isBusy: false, isAttention: false }), 'sleeping');
});

test('a live PTY without activity is sleeping, never a state of its own', () => {
  assert.equal(sessionStateFor({ isRunning: true }), 'sleeping');
  assert.equal(sessionStateFor({ isRunning: true, isBusy: false, isAttention: false, done: false }), 'sleeping');
});

test('a Plain Terminal has no Session State', () => {
  assert.equal(sessionStateFor({ type: 'terminal', isBusy: true, isAttention: true, done: true }), null);
});

test('a Run Terminal has no Session State', () => {
  assert.equal(sessionStateFor({ type: 'run-terminal', isBusy: true, isAttention: true, done: true }), null);
});

test('a real Session (any non-terminal type) does carry a state', () => {
  assert.equal(sessionStateFor({ type: 'session', isBusy: true }), 'working');
  assert.equal(sessionStateFor({ type: undefined, isBusy: true }), 'working');
});
