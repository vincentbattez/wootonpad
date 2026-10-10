const test = require('node:test');
const assert = require('node:assert/strict');

const { EXIT_POLICIES, isCrashExit, keepTabOnCrash } = require('../public/exit-policy');

// --- keepTabOnCrash -----------------------------------------------------------------------------
// The crash-keep decision: a Claude Session keeps its tab, a local Terminal / Run Terminal does not
// — but a remote Plain Terminal (type 'terminal' + the main-propagated remotePlainTerminal flag)
// keeps it too, so main.js's async Host diagnostic has a tab to land in (VIN-156).

test('keepTabOnCrash — a Claude Session keeps its tab', () => {
  assert.equal(keepTabOnCrash('session', false), true);
  assert.equal(keepTabOnCrash(undefined, false), true); // unknown type falls back to default
});

test('keepTabOnCrash — a local Plain Terminal / Run Terminal does not keep its tab', () => {
  assert.equal(keepTabOnCrash('terminal', false), false);
  assert.equal(keepTabOnCrash('run-terminal', false), false);
});

test('keepTabOnCrash — a remote Plain Terminal keeps its tab (VIN-156)', () => {
  // The one 'terminal' that must survive a crash: the flag comes from main, overriding the policy.
  assert.equal(keepTabOnCrash('terminal', true), true);
});

test('keepTabOnCrash — the remote flag never un-keeps a type that already keeps', () => {
  assert.equal(keepTabOnCrash('session', true), true);
});

// --- isCrashExit --------------------------------------------------------------------------------

test('isCrashExit — a non-zero exit with no signal is a crash', () => {
  assert.equal(isCrashExit(1, {}), true);
  assert.equal(isCrashExit(127, { stoppedByUser: false }), true);
});

test('isCrashExit — a clean exit, a user stop, a signal or an interrupt code is not a crash', () => {
  assert.equal(isCrashExit(0, {}), false);
  assert.equal(isCrashExit(1, { stoppedByUser: true }), false);
  assert.equal(isCrashExit(143, { signal: 'SIGTERM' }), false);
  assert.equal(isCrashExit(130, {}), false); // Ctrl-C
  assert.equal(isCrashExit(143, {}), false); // SIGTERM as 128+15
});

// --- forgetOnExit shape (the other half of the policy app.js reads) -----------------------------

test('EXIT_POLICIES — a plain Terminal is forgotten on exit, a Run Terminal and a Session are not', () => {
  assert.equal(EXIT_POLICIES['terminal'].forgetOnExit, true);
  assert.equal(EXIT_POLICIES['run-terminal'].forgetOnExit, false);
  assert.equal(EXIT_POLICIES.default.forgetOnExit, 'pendingOnly');
});
