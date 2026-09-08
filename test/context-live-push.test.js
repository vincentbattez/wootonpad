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

// Track every temp dir so the whole suite cleans up after itself instead of leaking a
// mkdtemp dir per test into os.tmpdir().
const tempDirs = [];
function makeProjectsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vin149-live-'));
  tempDirs.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function writeSession(dir, folder, sessionId, entries) {
  const folderPath = path.join(dir, folder);
  fs.mkdirSync(folderPath, { recursive: true });
  const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(folderPath, sessionId + '.jsonl'), body);
}

// Usage first, model second — the same argument order as e2e/app-fixture.js's assistantMessage,
// so the two assistant-jsonl builders cannot be confused. The shapes differ on purpose (this
// one is a full jsonl entry with a type wrapper; the fixture's is the inner message object),
// so they stay two builders rather than one shared helper.
function assistantEntry(usage, model) {
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
    assistantEntry({ input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 10 }, 'claude-opus-4-1'),
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
  writeSession(dir, 'proj', 's1', [assistantEntry({ input_tokens: 1 }, 'm')]);
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
  writeSession(dir, 'proj', 's1', [assistantEntry({ input_tokens: 100 }, 'm')]);
  const { send, events } = collector();
  let now = 1000;
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => now, intervalMs: 2500 });

  live.onFileChanged('proj', 's1.jsonl');
  // The turn writes a second, larger assistant entry.
  writeSession(dir, 'proj', 's1', [
    assistantEntry({ input_tokens: 100 }, 'm'),
    assistantEntry({ input_tokens: 300 }, 'm'),
  ]);
  now += 2500;
  live.onFileChanged('proj', 's1.jsonl');

  assert.equal(events.length, 2);
  assert.equal(events[1].usage.inputTokens, 300);
});

test('several sessions writing together each push on their own key', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 's1', [assistantEntry({ input_tokens: 1 }, 'm')]);
  writeSession(dir, 'proj', 's2', [assistantEntry({ input_tokens: 2 }, 'm')]);
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

// onFolderChanged is the poller fallback's entry point (WSL, and any account whose fs.watch
// failed): folder-mtime granular, so it must find the changed file itself.

test('a changed folder pushes its most-recently-modified .jsonl', () => {
  const dir = makeProjectsDir();
  writeSession(dir, 'proj', 'stale', [assistantEntry({ input_tokens: 1 }, 'm')]);
  writeSession(dir, 'proj', 'active', [assistantEntry({ input_tokens: 300 }, 'm')]);
  // Make 'active' unambiguously the newest, regardless of write order's mtime granularity.
  const now = Date.now();
  fs.utimesSync(path.join(dir, 'proj', 'stale.jsonl'), new Date(now - 10000), new Date(now - 10000));
  fs.utimesSync(path.join(dir, 'proj', 'active.jsonl'), new Date(now), new Date(now));
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  live.onFolderChanged('proj');

  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'active');
  assert.equal(events[0].usage.inputTokens, 300);
});

test('a changed folder with no .jsonl pushes nothing', () => {
  const dir = makeProjectsDir();
  const folderPath = path.join(dir, 'proj');
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(path.join(folderPath, 'sessions-index.json'), '{}');
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  live.onFolderChanged('proj');

  assert.equal(events.length, 0);
});

test('a missing folder no-ops rather than throwing', () => {
  const dir = makeProjectsDir();
  const { send, events } = collector();
  const live = createContextLivePush({ send, projectsDir: () => dir, now: () => 1000 });

  assert.doesNotThrow(() => live.onFolderChanged('does-not-exist'));
  assert.equal(events.length, 0);
});
