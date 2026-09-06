const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSessionFile } = require('../read-session-file');

function makeTmpSession(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-session-'));
  const file = path.join(dir, 'abc123.jsonl');
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return { dir, file };
}

test('parses a minimal valid session', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Hello world', cwd: '/some/project', sessionId: 'abc123' },
    { type: 'assistant', message: 'Hi there' },
  ]);
  try {
    const session = readSessionFile(file, 'some-folder', '/some/project');
    assert.ok(session, 'should return a session object');
    assert.equal(session.sessionId, 'abc123');
    assert.equal(session.summary, 'Hello world');
    assert.equal(session.messageCount, 2);
    assert.equal(session.folder, 'some-folder');
    assert.equal(session.projectPath, '/some/project');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns null when no user messages', () => {
  const { file, dir } = makeTmpSession([
    { type: 'assistant', message: 'Only assistant' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracts slug from first entry that has it', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Start', slug: 'my-task' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.slug, 'my-task');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracts aiTitle', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Do something' },
    { type: 'ai-title', aiTitle: 'Generated Title' },
    { type: 'assistant', message: 'Done' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.aiTitle, 'Generated Title');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracts customTitle', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Do something' },
    { type: 'custom-title', customTitle: 'My Custom Name' },
    { type: 'assistant', message: 'Done' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.customTitle, 'My Custom Name');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips local command messages for summary', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<local-command-caveat>! ls</local-command-caveat>' },
    { type: 'user', message: 'Real first message' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.summary, 'Real first message');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns null for empty file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-session-'));
  const file = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(file, '', 'utf8');
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns null for non-existent file', () => {
  const session = readSessionFile('/nonexistent/path/file.jsonl', 'folder', '/path');
  assert.equal(session, null);
});

test('uses scheduled task name in summary', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<scheduled-task name="Daily Digest">run the task</scheduled-task>' },
    { type: 'assistant', message: 'Done' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.ok(session.summary.includes('Daily Digest'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Context gauge: last assistant usage + model (VIN-143) ---

test('extracts the last assistant usage breakdown and model', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Hi' },
    { type: 'assistant', message: { model: 'claude-opus-4-1-20250805', usage: {
      input_tokens: 10, cache_creation_input_tokens: 20,
      cache_read_input_tokens: 300, output_tokens: 40 } } },
  ]);
  try {
    const s = readSessionFile(file, 'folder', '/path');
    assert.deepEqual(s.contextUsage, {
      inputTokens: 10, cacheCreationTokens: 20, cacheReadTokens: 300, outputTokens: 40,
    });
    assert.equal(s.contextModel, 'claude-opus-4-1-20250805');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('has no context usage when there is no assistant turn', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'First' },
    { type: 'user', message: 'Second, still no assistant' },
  ]);
  try {
    const s = readSessionFile(file, 'folder', '/path');
    assert.ok(s, 'session still parses');
    assert.equal(s.contextUsage, null);
    assert.equal(s.contextModel, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('takes the last assistant usage when the last entry is a user turn', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Hi' },
    { type: 'assistant', message: { model: 'claude-opus-4', usage: {
      input_tokens: 1, cache_creation_input_tokens: 2,
      cache_read_input_tokens: 3, output_tokens: 4 } } },
    { type: 'user', message: 'A follow-up with no answer yet' },
  ]);
  try {
    const s = readSessionFile(file, 'folder', '/path');
    assert.equal(s.contextUsage.inputTokens, 1);
    assert.equal(s.contextUsage.outputTokens, 4);
    assert.equal(s.contextModel, 'claude-opus-4');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reports the post-compaction usage, not a cumulative total', () => {
  const preTokens = 156694;
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Long conversation' },
    { type: 'assistant', message: { model: 'claude-opus-4', usage: {
      input_tokens: 100, cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 155494, output_tokens: 100 } } }, // sums to 156694
    { type: 'system', compactMetadata: { trigger: 'manual', preTokens } },
    { type: 'assistant', message: { model: 'claude-opus-4', usage: {
      input_tokens: 5, cache_creation_input_tokens: 10,
      cache_read_input_tokens: 8000, output_tokens: 25 } } },
  ]);
  try {
    const s = readSessionFile(file, 'folder', '/path');
    // After compaction the gauge shows the fresh, smaller number.
    const sum = s.contextUsage.inputTokens + s.contextUsage.cacheCreationTokens +
      s.contextUsage.cacheReadTokens + s.contextUsage.outputTokens;
    assert.equal(sum, 8040);
    assert.notEqual(sum, preTokens);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips invalid JSON lines while still reading usage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-session-'));
  const file = path.join(dir, 'abc123.jsonl');
  const good = [
    JSON.stringify({ type: 'user', message: 'Hi' }),
    '{ this is not valid json',
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4', usage: {
      input_tokens: 7, cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0, output_tokens: 3 } } }),
  ];
  fs.writeFileSync(file, good.join('\n') + '\n', 'utf8');
  try {
    const s = readSessionFile(file, 'folder', '/path');
    assert.ok(s, 'invalid line does not abort the parse');
    assert.equal(s.contextUsage.inputTokens, 7);
    assert.equal(s.contextUsage.outputTokens, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- First-prompt sanitisation (VIN-146) ---
// 35% of Sessions carry no ai-title, so the first prompt IS the title for one Session in three.
// The preamble filter that already skipped local-command messages widens to the harness tags seen
// in the corpus, and the retained summary becomes the first useful line rather than a brute
// 120-char truncation that could cut across newlines or land mid-paste.

const { summariseFirstPrompt } = require('../read-session-file');

test('skips a <command-message> preamble for the summary', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<command-message>init is analyzing your codebase</command-message>' },
    { type: 'user', message: 'Real first message' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    assert.equal(readSessionFile(file, 'folder', '/path').summary, 'Real first message');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips a <teammate-message> preamble carrying attributes', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<teammate-message from="alice" id="7">ping</teammate-message>' },
    { type: 'user', message: 'Actual request' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    assert.equal(readSessionFile(file, 'folder', '/path').summary, 'Actual request');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips the remaining harness tags observed in the corpus', () => {
  for (const noise of [
    '<command-name>/review</command-name>',
    '<command-args>--fix</command-args>',
    '<command-contents>{"x":1}</command-contents>',
    '<bash-stderr>command not found</bash-stderr>',
    '<system-reminder>Your context is running low</system-reminder>',
  ]) {
    const { file, dir } = makeTmpSession([
      { type: 'user', message: noise },
      { type: 'user', message: 'The real one' },
      { type: 'assistant', message: 'Response' },
    ]);
    try {
      assert.equal(readSessionFile(file, 'folder', '/path').summary, 'The real one', noise);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('no harness tag survives as a title when every user turn is noise', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<system-reminder>nothing to see</system-reminder>' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    // No usable prompt at all is the existing "unusable session" case: null, never a tag.
    assert.equal(readSessionFile(file, 'folder', '/path'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('retains the first useful line rather than truncating across newlines', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Fix the login redirect\n\nHere is the stack trace:\n  at foo (a.js:1)' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    assert.equal(readSessionFile(file, 'folder', '/path').summary, 'Fix the login redirect');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a first prompt that is only a paste yields one sane line, not an absurd title', () => {
  const paste = '\n\n  2026-09-03 07:12:44 ERROR  worker crashed with signal 9\n' +
    '2026-09-03 07:12:45 ERROR  worker crashed with signal 9\n'.repeat(50);
  const { file, dir } = makeTmpSession([
    { type: 'user', message: paste },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    const summary = readSessionFile(file, 'folder', '/path').summary;
    assert.equal(summary, '2026-09-03 07:12:44 ERROR  worker crashed with signal 9');
    assert.ok(!summary.includes('\n'), 'a title is a single line');
    assert.ok(summary.length <= 120);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('summariseFirstPrompt caps a long single line at 120 characters', () => {
  assert.equal(summariseFirstPrompt('x'.repeat(500)).length, 120);
});

test('summariseFirstPrompt keeps the scheduled-task name', () => {
  assert.equal(
    summariseFirstPrompt('<scheduled-task name="Daily Digest">run it</scheduled-task>'),
    'Scheduled: Daily Digest',
  );
});

test('summariseFirstPrompt returns empty for a blank prompt', () => {
  assert.equal(summariseFirstPrompt('   \n\n  \n'), '');
  assert.equal(summariseFirstPrompt(''), '');
});
