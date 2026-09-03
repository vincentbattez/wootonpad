const path = require('path');
const fs = require('fs');

/**
 * The context gauge's usage breakdown for one .jsonl entry, or null if the entry is not
 * an assistant turn carrying a `message.usage`. Single-sourced so the folder parser and
 * the live tail reader agree on what the four counters and the model are (VIN-143).
 */
function extractContextUsage(entry) {
  const isAssistant = entry.type === 'assistant' ||
    (entry.type === 'message' && entry.role === 'assistant');
  const usage = isAssistant && entry.message && typeof entry.message === 'object'
    ? entry.message.usage : null;
  if (!usage) return null;
  return {
    contextUsage: {
      inputTokens: usage.input_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
    },
    contextModel: entry.message.model || null,
  };
}

/**
 * The harness markup a user turn can carry that is not the user talking (VIN-146). The local
 * command tags were already filtered here; the rest are the tags observed across the corpus.
 * A first message that is one of these is a preamble, so the summary moves to the next real turn.
 * Sanitising at ingestion rather than at display keeps one summary circulating through the whole
 * system, the search index included.
 */
const HARNESS_NOISE = /<(?:bash-input|bash-stdout|bash-stderr|local-command-caveat|command-message|command-name|command-args|command-contents|teammate-message|system-reminder)[\s>]/;

/**
 * The title-worthy one-liner for a first prompt, or '' when there is nothing usable.
 *
 * A scheduled run is named by its task. Otherwise the summary is the first useful (non-blank)
 * line, capped at 120 characters — a brute truncation of the raw text cut across newlines and
 * turned a prompt that opens with a pasted log or a code block into an absurd title.
 */
function summariseFirstPrompt(text) {
  if (!text) return '';
  const taskMatch = text.match(/<scheduled-task\s+name="([^"]+)"/);
  if (taskMatch) return 'Scheduled: ' + taskMatch[1];
  const firstUsefulLine = text.split('\n').map(l => l.trim()).find(Boolean) || '';
  return firstUsefulLine.slice(0, 120);
}

/** Parse a single .jsonl file into a session object (or null if invalid) */
function readSessionFile(filePath, folder, projectPath) {
  const sessionId = path.basename(filePath, '.jsonl');
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    let summary = '';
    let messageCount = 0;
    let textContent = '';
    let slug = null;
    let customTitle = null;
    let aiTitle = null;
    // Context gauge (VIN-143): the live context size is the usage of the LAST assistant
    // entry, its four counters kept apart for the tooltip, plus that entry's model. A
    // compaction writes a fresh, smaller assistant turn after it, so "last assistant"
    // already yields the post-compaction value, not a cumulative total.
    let contextUsage = null;
    let contextModel = null;
    for (const line of lines) {
      let entry;
      // One malformed line must not blank an otherwise valid session (AC: files with
      // invalid JSON lines). Skip it and keep reading.
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.slug && !slug) slug = entry.slug;
      if (entry.type === 'custom-title' && entry.customTitle) {
        customTitle = entry.customTitle;
      }
      if (entry.type === 'ai-title' && entry.aiTitle) {
        aiTitle = entry.aiTitle;
      }
      if (entry.type === 'user' || entry.type === 'assistant' ||
          (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant'))) {
        messageCount++;
      }
      const ctx = extractContextUsage(entry);
      if (ctx) {
        contextUsage = ctx.contextUsage;
        contextModel = ctx.contextModel;
      }
      const msg = entry.message;
      const text = typeof msg === 'string' ? msg :
        (typeof msg?.content === 'string' ? msg.content :
        (msg?.content?.[0]?.text || ''));
      if (!summary && (entry.type === 'user' || (entry.type === 'message' && entry.role === 'user'))) {
        // Skip harness preambles — use the next real user message
        if (text && !HARNESS_NOISE.test(text)) {
          summary = summariseFirstPrompt(text);
        }
      }
      if (text && textContent.length < 8000) {
        textContent += text.slice(0, 500) + '\n';
      }
    }
    if (!summary || messageCount < 1) return null;
    return {
      sessionId, folder, projectPath,
      summary, firstPrompt: summary,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      messageCount, textContent, slug, customTitle, aiTitle,
      contextUsage, contextModel,
    };
  } catch {
    return null;
  }
}

/**
 * The live fast path (VIN-143): read only the tail of a Session's .jsonl (default 256KB)
 * and return { contextUsage, contextModel } of its last assistant turn, or null. Called on
 * the busy→idle transition, so the gauge moves within a second of a turn without a full
 * re-parse. A possibly-truncated first line and any invalid line are skipped.
 */
function readSessionContextTail(filePath, tailBytes = 262144) {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    const readSize = Math.min(size, tailBytes);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, size - readSize);
    fs.closeSync(fd);
    let lines = buf.toString('utf8').split('\n').filter(Boolean);
    // If we started mid-file, the first line is likely a fragment — drop it.
    if (size > readSize && lines.length) lines = lines.slice(1);
    let result = null;
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const ctx = extractContextUsage(entry);
      if (ctx) result = ctx;
    }
    return result;
  } catch {
    return null;
  }
}

module.exports = { readSessionFile, summariseFirstPrompt, extractContextUsage, readSessionContextTail };
