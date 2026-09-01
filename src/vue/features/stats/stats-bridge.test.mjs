import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect } from 'vue';
import { createStatsBridge } from './stats-bridge.js';
import { statsStore } from './stats-store.js';

// The stats bridge inverts the old defineExpose({ load, invalidate }) setters:
// each method bumps a request counter the Container watches, instead of reaching
// into a component through a template ref. window.vueStats.load/invalidate is the
// frozen surface app.js calls.

test('load bumps the load request counter', () => {
  const bridge = createStatsBridge(statsStore);
  const before = statsStore.loadRequest;
  bridge.load();
  assert.equal(statsStore.loadRequest, before + 1);
});

test('invalidate bumps the invalidate request counter', () => {
  const bridge = createStatsBridge(statsStore);
  const before = statsStore.invalidateRequest;
  bridge.invalidate();
  assert.equal(statsStore.invalidateRequest, before + 1);
});

test('a load write triggers effects that watch the counter', () => {
  const bridge = createStatsBridge(statsStore);
  let seen;
  const stop = effect(() => { seen = statsStore.loadRequest; });
  const initial = seen;
  bridge.load();
  assert.equal(seen, initial + 1, 'effect watching the counter saw the bridge write');
  stop.effect.stop();
});
