import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDebouncedSearch } from './use-debounced-search.js';

// The shared debounced-search trigger: onInput debounces onSearch, an empty query
// fires onClear immediately, clear() cancels and clears, flush() runs at once.

test('onInput fires onSearch with the trimmed query after the delay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searched = [];
  const { onInput } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => {}, delay: 200 });
  onInput('  hello  ');
  assert.deepEqual(searched, [], 'nothing runs before the delay elapses');
  t.mock.timers.tick(200);
  assert.deepEqual(searched, ['hello'], 'the trimmed query is searched once the delay elapses');
});

test('a second onInput cancels the first pending run', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searched = [];
  const { onInput } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => {}, delay: 200 });
  onInput('a');
  t.mock.timers.tick(100);
  onInput('ab');
  t.mock.timers.tick(100);
  assert.deepEqual(searched, [], 'the first run was cancelled and the second not yet due');
  t.mock.timers.tick(100);
  assert.deepEqual(searched, ['ab'], 'only the latest query is searched');
});

test('an empty query fires onClear instead of onSearch', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cleared = 0;
  const searched = [];
  const { onInput } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => cleared++, delay: 200 });
  onInput('   ');
  t.mock.timers.tick(200);
  assert.equal(cleared, 1);
  assert.deepEqual(searched, []);
});

test('clear() cancels a pending run and fires onClear now', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cleared = 0;
  const searched = [];
  const { onInput, clear } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => cleared++, delay: 200 });
  onInput('pending');
  clear();
  assert.equal(cleared, 1, 'onClear fired synchronously');
  t.mock.timers.tick(200);
  assert.deepEqual(searched, [], 'the pending search was cancelled');
});

test('flush() runs the search immediately with no debounce', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searched = [];
  const { flush } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => {}, delay: 200 });
  flush('  live  ');
  assert.deepEqual(searched, ['live'], 'the query is searched at once, trimmed');
});

test('flush() with an empty query does nothing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searched = [];
  let cleared = 0;
  const { flush } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => cleared++, delay: 200 });
  flush('   ');
  assert.deepEqual(searched, []);
  assert.equal(cleared, 0, 'flush does not clear — it only runs a non-empty query');
});

test('flush() cancels a pending debounced run', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const searched = [];
  const { onInput, flush } = useDebouncedSearch({ onSearch: (q) => searched.push(q), onClear: () => {}, delay: 200 });
  onInput('typed');
  flush('typed');
  t.mock.timers.tick(200);
  assert.deepEqual(searched, ['typed'], 'the flush ran it once; the cancelled debounce did not run it again');
});
