const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createContextLivePush } = require('../context-live-push');

// Integration, main side: a real .jsonl grows on disk, and the live push emits the right
// context event on the right Session key with the right value — reading only the tail, never
// re-parsing the whole file — with the throttle spacing a burst. `now` is injected so the
// cadence is tested without waiting.

function makeProjectsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vin149-live-'));
  return dir;
}

function writeSession(dir, folder, sessionId, entries) {
  const folderPath = path.join(dir, folder);
  fs.mkdirSync(folderPath, { recursive: true });
  const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(folderPath, sessionId + '.jsonl'), body);
}

function assistantEntry(model, usage) {
  return { type: 'assistant', message: { role: 'assistant', model, usage } };
}

function collector() {
  const events = [];
  return { send: (id, usage, model) => events.push({ id, usage, model }), events };
}

test('a .jsonl write pushes the tail context on the file\'s session key', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 's1', [
    { type: 'user', message: { role: 'user', content: 'hi' } },
    assistantEntry('claude-opus-4-1', { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 10 }),
  ]);
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  live.onFileChanged('proj', 's1.jsonl');

  assert.equal(events.length, 1);
  assert.equal(events[0].id, 's1');
  assert.equal(events[0].model, 'claude-opus-4-1');
  assert.deepEqual(events[0].usage, {
    inputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 50, outputTokens: 10,
  });
});

test('a burst of writes on one session collapses to a single push', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 's1', [assistantEntry('m', { input_tokens: 1 })]);
  const { send, events } = collector();
  let now = 1000;
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => now });

  live.onFileChanged('proj', 's1.jsonl');
  now += 500;
  live.onFileChanged('proj', 's1.jsonl');
  now += 500;
  live.onFileChanged('proj', 's1.jsonl');

  assert.equal(events.length, 1);
});

test('once the interval has elapsed the newer value pushes', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 's1', [assistantEntry('m', { input_tokens: 100 })]);
  const { send, events } = collector();
  let now = 1000;
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => now, intervalMs: 2500 });

  live.onFileChanged('proj', 's1.jsonl');
  // The turn writes a second, larger assistant entry.
  writeSession(dir, 'proj', 's1', [
    assistantEntry('m', { input_tokens: 100 }),
    assistantEntry('m', { input_tokens: 300 }),
  ]);
  now += 2500;
  live.onFileChanged('proj', 's1.jsonl');

  assert.equal(events.length, 2);
  assert.equal(events[1].usage.inputTokens, 300);
});

test('several sessions writing together each push on their own key', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 's1', [assistantEntry('m', { input_tokens: 1 })]);
  writeSession(dir, 'proj', 's2', [assistantEntry('m', { input_tokens: 2 })]);
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  live.onFileChanged('proj', 's1.jsonl');
  live.onFileChanged('proj', 's2.jsonl');

  assert.deepEqual(events.map((e) => e.id).sort(), ['s1', 's2']);
});

test('a session with no assistant usage yet emits nothing', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 's1', [{ type: 'user', message: { role: 'user', content: 'hi' } }]);
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  live.onFileChanged('proj', 's1.jsonl');

  assert.equal(events.length, 0);
});

test('a non-.jsonl change is ignored', () => {
  const dir = makeProjectsDir();
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  live.onFileChanged('proj', 'sessions-index.json');

  assert.equal(events.length, 0);
});
