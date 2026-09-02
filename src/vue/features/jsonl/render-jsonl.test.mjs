import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderTranscript,
  renderJsonlEntry,
  mergeLocalCommandEntries,
  escapeHtml,
  formatDuration,
} from './render-jsonl.mjs';

// The renderer is a pure function: fixed entries in, fixed markup out. No DOM,
// no window, no mounting — so the transcript can be asserted byte for byte.

const entry = (over = {}) => renderJsonlEntry(over.entry, over.map ?? new Map(), over.opts);

// ── escapeHtml ────────────────────────────────────────────────────

test('escapeHtml escapes the three markup characters and leaves quotes', () => {
  assert.equal(escapeHtml('<a & b> "q" \'q\''), '&lt;a &amp; b&gt; "q" \'q\'');
});

test('escapeHtml coerces nullish to an empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

// ── formatDuration ────────────────────────────────────────────────

test('formatDuration shows ms under a second and seconds above', () => {
  assert.equal(formatDuration(500), '500ms');
  assert.equal(formatDuration(1500), '1.5s');
});

// ── plain text ────────────────────────────────────────────────────

test('an assistant text block renders a jsonl-text div with markdown fallback', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'text', text: 'a **bold** and `code`' }] } });
  assert.equal(
    html,
    '<div class="jsonl-entry jsonl-assistant"><div class="jsonl-text">a <strong>bold</strong> and <code class="jsonl-inline-code">code</code></div></div>',
  );
});

test('text is html-escaped before markdown in the fallback path', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'text', text: 'x < y & z' }] } });
  assert.equal(html, '<div class="jsonl-entry jsonl-assistant"><div class="jsonl-text">x &lt; y &amp; z</div></div>');
});

test('an injected marked renderer is used instead of the fallback', () => {
  const marked = { parse: (s) => `<p>${s}</p>` };
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'text', text: 'hi' }] }, opts: { marked } });
  assert.equal(html, '<div class="jsonl-entry jsonl-assistant"><div class="jsonl-text"><p>hi</p></div></div>');
});

test('a user string content is wrapped as a single text block', () => {
  const html = entry({ entry: { type: 'user', content: 'hello' } });
  assert.equal(html, '<div class="jsonl-entry jsonl-user"><div class="jsonl-text">hello</div></div>');
});

test('an entry that produces no children renders as null', () => {
  assert.equal(entry({ entry: { type: 'assistant', content: [{ type: 'text', text: '   ' }] } }), null);
});

test('an unknown entry type renders as null', () => {
  assert.equal(entry({ entry: { type: 'summary', content: 'x' } }), null);
});

// ── meta entries ──────────────────────────────────────────────────

test('a custom-title entry renders the meta line', () => {
  const html = entry({ entry: { type: 'custom-title', customTitle: 'My <Title>' } });
  assert.equal(html, '<div class="jsonl-entry jsonl-meta-entry"><span class="jsonl-meta-icon">T</span> Title set: <strong>My &lt;Title&gt;</strong></div>');
});

test('a turn_duration system entry renders the formatted duration', () => {
  const html = entry({ entry: { type: 'system', subtype: 'turn_duration', durationMs: 2500 } });
  assert.equal(html, '<div class="jsonl-entry jsonl-meta-entry"><span class="jsonl-meta-icon">&#9201;</span> Turn duration: <strong>2.5s</strong></div>');
});

test('an unhandled system subtype renders as null', () => {
  assert.equal(entry({ entry: { type: 'system', subtype: 'other' } }), null);
});

test('a bash_progress entry renders an expanded output block', () => {
  const html = entry({ entry: { type: 'progress', data: { type: 'bash_progress', elapsedTimeSeconds: 3, totalLines: 2, output: 'line' } } });
  assert.equal(
    html,
    '<div class="jsonl-entry jsonl-meta-entry"><span class="jsonl-meta-icon">&#9658;</span> Bash output (3s, 2 lines)'
      + '<div class="jsonl-tool-result"><div class="jsonl-toggle expanded">Output</div><pre class="jsonl-tool-body">line</pre></div></div>',
  );
});

// ── thinking ──────────────────────────────────────────────────────

test('a thinking block renders a collapsed jsonl-thinking section', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }] } });
  assert.equal(
    html,
    '<div class="jsonl-entry jsonl-assistant"><div class="jsonl-thinking"><div class="jsonl-toggle">Thinking</div><pre class="jsonl-tool-body" style="display: none">hmm</pre></div></div>',
  );
});

// ── tool_use ──────────────────────────────────────────────────────

test('a Read tool renders a summary-only tool block with no content div', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b/c/file.js', limit: 10, offset: 5 } }] } });
  assert.equal(
    html,
    '<div class="jsonl-entry jsonl-assistant"><div class="jsonl-tool-block"><div class="jsonl-tool-header">'
      + '<span class="jsonl-tool-bullet" style="color:#8888a0">●</span><span class="jsonl-tool-name">Read</span>'
      + '<span class="jsonl-tool-summary"><code>b/c/file.js:5-15</code></span></div></div></div>',
  );
});

test('an Edit tool renders a del/add diff in its content', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'x.js', old_string: 'a', new_string: 'b' } }] } });
  assert.ok(html.includes('<div class="jsonl-tool-content"><pre class="jsonl-tool-diff">'));
  assert.ok(html.includes('<span class="jsonl-diff-del">- a</span>\n'));
  assert.ok(html.includes('<span class="jsonl-diff-add">+ b</span>\n'));
});

test('an unknown tool falls back to an expanded Input dump', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'tool_use', name: 'Mystery', input: { k: 1 } }] } });
  assert.ok(html.includes('<span class="jsonl-tool-name">Mystery</span>'));
  assert.ok(html.includes('<div class="jsonl-toggle expanded">Input</div>'));
  assert.ok(html.includes('<pre class="jsonl-tool-body">' + escapeHtml(JSON.stringify({ k: 1 }, null, 2)) + '</pre>'));
});

test('an mcp action with an action field routes through renderMcpAction', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'tool_use', name: 'mcp__pw__browser', input: { action: 'click', selector: '#go' } }] } });
  assert.ok(html.includes('<span class="jsonl-tool-name">Click</span>'));
  assert.ok(html.includes('<span class="jsonl-tool-detail">browser</span> <code>#go</code>'));
});

// ── tool_use paired with a tool_result ────────────────────────────

test('a tool_use is joined to its tool_result via the result map', () => {
  const map = new Map([['t1', 'the output']]);
  const html = renderJsonlEntry(
    { type: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'f' } }] },
    map,
  );
  assert.ok(html.includes('<div class="jsonl-tool-content"><div class="jsonl-tool-result"><pre class="jsonl-tool-body">the output</pre></div></div>'));
  assert.equal(map.has('t1'), false, 'the consumed result is removed from the map');
});

test('a standalone tool_result renders a collapsed Tool Result block', () => {
  const html = entry({ entry: { type: 'user', content: [{ type: 'tool_result', content: 'r' }] } });
  // A user turn of only tool_result renders on the assistant side.
  assert.ok(html.startsWith('<div class="jsonl-entry jsonl-assistant">'));
  assert.ok(html.includes('<div class="jsonl-toggle">Tool Result</div>'));
});

test('a tool_result already claimed by a tool_use is skipped', () => {
  // The result map no longer holds t1: a preceding tool_use consumed it.
  const map = new Map();
  const html = entry({ entry: { type: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] }, map });
  assert.equal(html, null);
});

// ── local command merging ─────────────────────────────────────────

test('mergeLocalCommandEntries folds a bash-input run into one local-command entry', () => {
  const entries = [
    { type: 'user', content: '<local-command-caveat>x</local-command-caveat>' },
    { type: 'user', content: '<bash-input>ls -la</bash-input>' },
    { type: 'user', content: '<bash-stdout>a\nb</bash-stdout>' },
  ];
  const merged = mergeLocalCommandEntries(entries);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]._localCmd, { cmd: 'ls -la', output: 'a\nb' });
});

test('a local command renders a Bash tool block with its output', () => {
  const html = entry({ entry: { _localCmd: { cmd: 'ls', output: 'a' } } });
  assert.equal(
    html,
    '<div class="jsonl-tool-block"><div class="jsonl-tool-header"><span class="jsonl-tool-bullet" style="color:#80c0e0">●</span>'
      + '<span class="jsonl-tool-name">Bash</span><span class="jsonl-tool-summary"><span class="jsonl-tool-detail">local</span></span></div>'
      + '<div class="jsonl-tool-content"><pre class="jsonl-tool-cmd-block">ls</pre><pre class="jsonl-tool-cmd-block">a</pre></div></div>',
  );
});

// ── whole transcript ──────────────────────────────────────────────

test('renderTranscript concatenates rendered entries and counts them', () => {
  const { html, count } = renderTranscript([
    { type: 'assistant', content: [{ type: 'text', text: 'one' }] },
    { type: 'system', subtype: 'other' }, // renders null, not counted
    { type: 'user', content: 'two' },
  ]);
  assert.equal(count, 2);
  assert.equal(
    html,
    '<div class="jsonl-entry jsonl-assistant"><div class="jsonl-text">one</div></div>'
      + '<div class="jsonl-entry jsonl-user"><div class="jsonl-text">two</div></div>',
  );
});

test('renderTranscript on no renderable entries reports a zero count', () => {
  const { html, count } = renderTranscript([{ type: 'system', subtype: 'other' }]);
  assert.equal(count, 0);
  assert.equal(html, '');
});

test('renderTranscript tolerates a missing entries array', () => {
  assert.deepEqual(renderTranscript(undefined), { html: '', count: 0 });
});

test('an inline image marker renders a clickable screenshot img', () => {
  const html = entry({ entry: { type: 'assistant', content: [{ type: 'text', text: '[Image: source: /tmp/x.png]' }] } });
  assert.equal(html, '<div class="jsonl-entry jsonl-assistant"><img class="jsonl-tool-screenshot jsonl-clickable-img" src="file:///tmp/x.png"></div>');
});
