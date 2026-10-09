const test = require('node:test');
const assert = require('node:assert/strict');

const { createContextPushThrottle, DEFAULT_PUSH_INTERVAL_MS } = require('../context-push-throttle');

// The one new seam of VIN-149: a pure decider that, given the Session ids whose .jsonl just
// changed and the current time, answers which to push now. It carries the throttle, the burst
// dedup and the single cadence constant — no I/O, so it is driven by advancing `now`.

test('a session appearing for the first time pushes immediately', () => {
  const throttle = createContextPushThrottle(2500);
  assert.deepEqual(throttle.select(['a'], 1000), ['a']);
});

test('a second write within the interval is throttled away', () => {
  const throttle = createContextPushThrottle(2500);
  throttle.select(['a'], 1000);
  assert.deepEqual(throttle.select(['a'], 1000 + 2499), []);
});

test('a write once the interval has elapsed pushes again', () => {
  const throttle = createContextPushThrottle(2500);
  throttle.select(['a'], 1000);
  assert.deepEqual(throttle.select(['a'], 1000 + 2500), ['a']);
});

test('a burst of the same id in one call collapses to a single push', () => {
  const throttle = createContextPushThrottle(2500);
  assert.deepEqual(throttle.select(['a', 'a', 'a'], 1000), ['a']);
});

test('several sessions changing together each push, on independent timers', () => {
  const throttle = createContextPushThrottle(2500);
  assert.deepEqual(throttle.select(['a', 'b', 'c'], 1000).sort(), ['a', 'b', 'c']);
  // b writes again inside its window while a has passed its own.
  assert.deepEqual(throttle.select(['b'], 1000 + 1000), []);
  assert.deepEqual(throttle.select(['a'], 1000 + 2500), ['a']);
});

test('the cadence constant is a single exported value in the 2–3s band', () => {
  assert.ok(DEFAULT_PUSH_INTERVAL_MS >= 2000 && DEFAULT_PUSH_INTERVAL_MS <= 3000);
  // The factory defaults to it, so the whole chain moves when the one constant moves.
  const throttle = createContextPushThrottle();
  throttle.select(['a'], 0);
  assert.deepEqual(throttle.select(['a'], DEFAULT_PUSH_INTERVAL_MS - 1), []);
  assert.deepEqual(throttle.select(['a'], DEFAULT_PUSH_INTERVAL_MS), ['a']);
});
