import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatusBarBridge } from './bridge.js';
import { statusBarStore } from './store.js';

// The status-bar bridge writes the feature store the Dumb StatusBar reads, instead
// of reaching into a component. The method names and signatures are the frozen
// contract app.js calls through window.vueStatusBar.

test('status-bar bridge writes info immediately', () => {
  const bridge = createStatusBarBridge(statusBarStore);
  bridge.setInfo('3 sessions');
  assert.equal(statusBarStore.info, '3 sessions');
});

test('status-bar setActivity writes text and marks the done class', () => {
  const bridge = createStatusBarBridge(statusBarStore);
  bridge.setActivity('working', 'progress');
  assert.equal(statusBarStore.activity, 'working');
  assert.equal(statusBarStore.activityClass, '');
  bridge.setActivity('finished', 'done');
  assert.equal(statusBarStore.activity, 'finished');
  assert.equal(statusBarStore.activityClass, 'status-done');
});

test('status-bar setUpdater writes the updater text', () => {
  const bridge = createStatusBarBridge(statusBarStore);
  bridge.setUpdater('Downloading update…');
  assert.equal(statusBarStore.updater, 'Downloading update…');
});
