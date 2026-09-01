import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect } from 'vue';
import { createViewerBridge } from '../src/vue/features/viewer/bridge.js';
import { viewerStore } from '../src/vue/features/viewer/store.js';

// The viewer bridge inverts the file panel's imperative open/destroy into store writes: each
// method writes the Feature store the bridged Container reads, instead of calling into a
// component through window.createViewerPanel's returned instance. The method names are the
// frozen contract the file panel calls.

test('viewer bridge writes the file to show as an open request', () => {
  const bridge = createViewerBridge(viewerStore);
  bridge.open('README', '/repo/README.md', '# Hi');
  assert.equal(viewerStore.openRequest.title, 'README');
  assert.equal(viewerStore.openRequest.filePath, '/repo/README.md');
  assert.equal(viewerStore.openRequest.content, '# Hi');
  viewerStore.openRequest = null;
});

test('viewer open bumps the seq so re-opening the same file re-triggers', () => {
  const bridge = createViewerBridge(viewerStore);
  bridge.open('A', '/a.md', 'a');
  const first = viewerStore.openRequest.seq;
  bridge.open('A', '/a.md', 'a');
  assert.equal(viewerStore.openRequest.seq, first + 1, 'seq advances on each open');
  viewerStore.openRequest = null;
});

test('viewer destroy bumps the destroy seq', () => {
  const bridge = createViewerBridge(viewerStore);
  const before = viewerStore.destroySeq;
  bridge.destroy();
  assert.equal(viewerStore.destroySeq, before + 1);
});

test('a viewer-store write triggers effects that read the request', () => {
  const bridge = createViewerBridge(viewerStore);
  let seen = 0;
  const stop = effect(() => { seen = viewerStore.openRequest?.seq ?? 0; });
  assert.equal(seen, 0);
  bridge.open('B', '/b.md', 'b');
  assert.equal(seen, viewerStore.openRequest.seq, 'effect reading the request saw the bridge write');
  viewerStore.openRequest = null;
  stop.effect.stop();
});
