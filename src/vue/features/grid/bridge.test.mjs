import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGridBridge } from './bridge.js';

// The grid Feature's Bridge writes into a store object, never into a component ref. A plain
// object with a Map stands in for the reactive store — the contract is the writes, not Vue.
function makeStore() {
  return { cards: new Map() };
}

test('addCard stores the header/footer targets and normalised flags', () => {
  const store = makeStore();
  const bridge = createGridBridge(store);
  const header = {}, footer = {};
  bridge.addCard('s1', header, footer, { name: 'Sess', project: 'proj', initials: 'SP', color: '#000', running: 1, busy: 0, time: '2m' });
  const card = store.cards.get('s1');
  assert.equal(card.headerEl, header);
  assert.equal(card.footerEl, footer);
  assert.equal(card.name, 'Sess');
  assert.equal(card.running, true);
  assert.equal(card.busy, false);
  assert.equal(card.time, '2m');
});

test('addCard defaults a missing time to the empty string', () => {
  const store = makeStore();
  const bridge = createGridBridge(store);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000' });
  assert.equal(store.cards.get('s1').time, '');
});

test('updateCard mutates an existing card and ignores unknown ids', () => {
  const store = makeStore();
  const bridge = createGridBridge(store);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000' });
  bridge.updateCard('s1', true, true, '5m');
  const card = store.cards.get('s1');
  assert.equal(card.running, true);
  assert.equal(card.busy, true);
  assert.equal(card.time, '5m');
  bridge.updateCard('missing', true, false);
  assert.equal(store.cards.has('missing'), false);
});

test('updateCard leaves time untouched when omitted', () => {
  const store = makeStore();
  const bridge = createGridBridge(store);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000', time: '1m' });
  bridge.updateCard('s1', false, false);
  assert.equal(store.cards.get('s1').time, '1m');
});

test('removeCard and clearAll empty the store map', () => {
  const store = makeStore();
  const bridge = createGridBridge(store);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000' });
  bridge.addCard('s2', {}, {}, { name: 'B', project: 'p', initials: 'B', color: '#000' });
  bridge.removeCard('s1');
  assert.equal(store.cards.has('s1'), false);
  assert.equal(store.cards.has('s2'), true);
  bridge.clearAll();
  assert.equal(store.cards.size, 0);
});
