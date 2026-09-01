import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/vue/shared/services/api.js';
import { sb } from '../src/vue/shared/services/sb.js';
import { globalProxy } from '../src/vue/shared/services/global-proxy.js';

// The two services front window.api and window.__sb — the preload IPC bridge and the
// legacy renderer's callbacks. They read the live global on every access, so a call made
// before the global is installed, or with the global gone, is a no-op through `?.` rather
// than a throw. That is the contract the old `window.api?.foo?.()` call-sites relied on.

test('api delegates to window.api and binds the call to it', () => {
  const seen = [];
  globalThis.window = { api: { getSetting(k) { seen.push([k, this]); return 'value'; } } };
  try {
    assert.equal(api.getSetting('searchTitlesOnly'), 'value');
    assert.equal(seen[0][0], 'searchTitlesOnly');
    assert.equal(seen[0][1], globalThis.window.api, 'method is bound to window.api');
  } finally {
    delete globalThis.window;
  }
});

test('api reads the global freshly — a bridge installed after import is picked up', () => {
  delete globalThis.window;
  assert.equal(api.getSetting?.(), undefined, 'no window yet: optional call is a no-op');
  globalThis.window = { api: { getSetting: () => 'now' } };
  try {
    assert.equal(api.getSetting(), 'now');
  } finally {
    delete globalThis.window;
  }
});

test('a missing api method is undefined, so an optional call stays a no-op', () => {
  globalThis.window = { api: {} };
  try {
    assert.equal(api.nothingHere, undefined);
    assert.equal(api.nothingHere?.(), undefined);
    assert.ok(!('nothingHere' in api));
  } finally {
    delete globalThis.window;
  }
});

test('sb delegates to window.__sb and no-ops when it is absent', () => {
  delete globalThis.window;
  assert.equal(sb.openSessionById?.('x'), undefined, 'no renderer callbacks: no-op');
  const seen = [];
  globalThis.window = { __sb: { openSessionById(id) { seen.push(id); } } };
  try {
    sb.openSessionById?.('sess-1');
    assert.deepEqual(seen, ['sess-1']);
  } finally {
    delete globalThis.window;
  }
});

test('globalProxy reads its source fresh and binds methods to it', () => {
  let source;
  const svc = globalProxy(() => source);

  assert.equal(svc.whatever, undefined, 'no source yet: any access is undefined');
  assert.ok(!('whatever' in svc));

  const seen = [];
  source = { greet(name) { seen.push([name, this]); return `hi ${name}`; } };
  assert.equal(svc.greet('a'), 'hi a');
  assert.equal(seen[0][1], source, 'method is bound to the source');
  assert.ok('greet' in svc);

  source = undefined;
  assert.equal(svc.greet?.(), undefined, 'source gone: optional call is a no-op');
});
