// Turns a session's JSONL entries into the Message History transcript markup.
// Pure: no DOM, no mounting, no window. It returns HTML strings; the Container
// paints them and wires the collapsible toggles and image fullscreen through
// delegation. The one non-deterministic input, a markdown renderer, is injected
// (`opts.marked`) rather than reached for globally.

// Mirrors public/utils.js escapeHtml (textContent → innerHTML): escapes the
// three markup characters, leaves quotes alone.
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderText(text, marked) {
  if (marked) {
    const escaped = text.replace(/<(\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?\/?)\>/g, '&lt;$1&gt;');
    return marked.parse(escaped);
  }
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="jsonl-code-block"><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="jsonl-inline-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return html;
}

export function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function bodyText(bodyContent) {
  if (typeof bodyContent === 'string') return bodyContent;
  try { return JSON.stringify(bodyContent, null, 2); } catch { return String(bodyContent); }
}

function makeInlineContent(className, bodyContent) {
  return '<div class="' + className + '"><pre class="jsonl-tool-body">' + escapeHtml(bodyText(bodyContent)) + '</pre></div>';
}

function makeCollapsible(className, headerText, bodyContent, startExpanded) {
  const toggleCls = 'jsonl-toggle' + (startExpanded ? ' expanded' : '');
  const style = startExpanded ? '' : ' style="display: none"';
  return '<div class="' + className + '">'
    + '<div class="' + toggleCls + '">' + escapeHtml(headerText) + '</div>'
    + '<pre class="jsonl-tool-body"' + style + '>' + escapeHtml(bodyText(bodyContent)) + '</pre>'
    + '</div>';
}

// A tool block is described by { color, label, summary, content }: `summary` is
// trusted HTML, `content` is trusted HTML or null (null omits the content div).
function toolBlock({ color, label, summary, content }) {
  let html = '<div class="jsonl-tool-block"><div class="jsonl-tool-header">'
    + '<span class="jsonl-tool-bullet" style="color:' + color + '">●</span>'
    + '<span class="jsonl-tool-name">' + escapeHtml(label) + '</span>'
    + (summary ? '<span class="jsonl-tool-summary">' + summary + '</span>' : '')
    + '</div>';
  if (content != null) html += '<div class="jsonl-tool-content">' + content + '</div>';
  return html + '</div>';
}

function shortPath(p) {
  return (p || '').split('/').slice(-3).join('/');
}

const toolRenderers = {
  Read(input) {
    const path = input.file_path || '';
    let range = '';
    if (input.offset || input.limit) {
      const start = input.offset || 0;
      range = input.limit ? `:${start}-${start + input.limit}` : `:${start}`;
    }
    return { color: '#8888a0', label: 'Read', summary: '<code>' + escapeHtml(shortPath(path) + range) + '</code>', content: null };
  },

  Edit(input) {
    const path = input.file_path || '';
    let content = null;
    if (input.old_string != null && input.new_string != null) {
      let html = '';
      for (const line of input.old_string.split('\n')) html += '<span class="jsonl-diff-del">- ' + escapeHtml(line) + '</span>\n';
      for (const line of input.new_string.split('\n')) html += '<span class="jsonl-diff-add">+ ' + escapeHtml(line) + '</span>\n';
      content = '<pre class="jsonl-tool-diff">' + html + '</pre>';
    }
    return { color: '#e0a040', label: 'Edit', summary: '<code>' + escapeHtml(shortPath(path)) + '</code>', content };
  },

  Write(input) {
    const path = input.file_path || '';
    const lines = (input.content || '').split('\n').length;
    const detail = '<code>' + escapeHtml(shortPath(path)) + '</code> <span class="jsonl-tool-detail">' + lines + ' lines</span>';
    const content = input.content ? makeCollapsible('jsonl-tool-result', 'Content', input.content, true) : null;
    return { color: '#60c060', label: 'Write', summary: detail, content };
  },

  Bash(input) {
    const cmd = input.command || '';
    return { color: '#80c0e0', label: 'Bash', summary: null, content: '<pre class="jsonl-tool-cmd-block">' + escapeHtml(cmd) + '</pre>' };
  },

  Grep(input) {
    const pattern = input.pattern || '';
    const path = input.path || '';
    const sp = path ? shortPath(path) : '';
    const summary = '<code>' + escapeHtml(pattern) + (sp ? ' in ' + escapeHtml(sp) : '') + '</code>';
    return { color: '#c090e0', label: 'Grep', summary, content: null };
  },

  Glob(input) {
    const pattern = input.pattern || '';
    return { color: '#c090e0', label: 'Glob', summary: '<code>' + escapeHtml(pattern) + '</code>', content: null };
  },

  Agent(input) {
    const desc = input.description || '';
    const type = input.subagent_type || '';
    const summary = (type ? '<span class="jsonl-tool-detail">' + escapeHtml(type) + '</span> ' : '') + escapeHtml(desc);
    return { color: '#f0a050', label: 'Agent', summary, content: null };
  },
};

function renderMcpAction(name, input) {
  const action = input.action;
  const shortName = name.replace(/^mcp__/, '').split('__').pop();
  const actionLabels = {
    type: 'Type', screenshot: 'Screenshot', click: 'Click', scroll: 'Scroll',
    hover: 'Hover', drag: 'Drag', key: 'Key', wait: 'Wait',
    javascript_exec: 'JS Exec', navigate: 'Navigate',
  };
  const label = actionLabels[action] || action;
  let summary = '<span class="jsonl-tool-detail">' + escapeHtml(shortName) + '</span>';
  let content = null;

  if (action === 'type' && input.text) {
    summary += ' <code>' + escapeHtml(input.text.length > 80 ? input.text.slice(0, 80) + '...' : input.text) + '</code>';
  } else if (action === 'click' && (input.x != null || input.selector)) {
    const target = input.selector || `(${input.x}, ${input.y})`;
    summary += ' <code>' + escapeHtml(target) + '</code>';
  } else if (action === 'key' && input.key) {
    summary += ' <code>' + escapeHtml(input.key) + '</code>';
  } else if (action === 'navigate' && input.url) {
    summary += ' <code>' + escapeHtml(input.url.length > 80 ? input.url.slice(0, 80) + '...' : input.url) + '</code>';
  } else if (action === 'scroll') {
    const dir = input.direction || (input.deltaY > 0 ? 'down' : 'up');
    summary += ' <span class="jsonl-tool-detail">' + escapeHtml(dir) + '</span>';
  } else if (action === 'javascript_exec' && input.text) {
    content = '<pre class="jsonl-tool-cmd-block">' + escapeHtml(input.text) + '</pre>';
  }

  return { color: '#c090e0', label, summary, content };
}

// `extraContent` is the tool_result markup to fold into the block's content
// region: null leaves the block as the renderer built it, a string (even '')
// forces a content div, matching the old "create it if the result is present".
function renderToolUse(block, extraContent) {
  const name = block.name || 'unknown';
  const input = block.input || {};
  let desc;
  const renderer = toolRenderers[name];
  if (renderer) {
    try { desc = renderer(input, block); } catch {}
  }
  if (!desc && input.action) {
    try { desc = renderMcpAction(name, input, block); } catch {}
  }
  if (!desc) {
    desc = { color: '#8888a0', label: name, summary: '', content: makeCollapsible('jsonl-tool-result', 'Input', input, true) };
  }
  if (extraContent != null) desc.content = (desc.content || '') + extraContent;
  return toolBlock(desc);
}

function renderLocalCommand({ cmd, output }) {
  let content = '<pre class="jsonl-tool-cmd-block">' + escapeHtml(cmd) + '</pre>';
  if (output) content += '<pre class="jsonl-tool-cmd-block">' + escapeHtml(output) + '</pre>';
  return toolBlock({ color: '#80c0e0', label: 'Bash', summary: '<span class="jsonl-tool-detail">local</span>', content });
}

function getEntryText(entry) {
  if (!entry) return null;
  const content = entry.message?.content || entry.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return null;
}

// Pulls the { cmd, output } out of a blob of <bash-input>/<bash-stdout>/<bash-stderr>
// tags, or null when there is no <bash-input> to anchor on.
function parseLocalCommand(combined) {
  const inputMatch = combined.match(/<bash-input>([\s\S]*?)<\/bash-input>/);
  if (!inputMatch) return null;
  const cmd = inputMatch[1].trim();
  const stdout = combined.match(/<bash-stdout>([\s\S]*?)<\/bash-stdout>/)?.[1].trim() || '';
  const stderr = combined.match(/<bash-stderr>([\s\S]*?)<\/bash-stderr>/)?.[1].trim() || '';
  const output = [stdout, stderr].filter(Boolean).join('\n');
  return { cmd, output };
}

// A run of `/`-command entries — the caveat, the <bash-input>, its stdout/stderr —
// collapses into one synthetic local-command entry rendered as a Bash block.
export function mergeLocalCommandEntries(entries) {
  const result = [];
  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    const text = getEntryText(entry);

    if (text && (/<local-command-caveat>/.test(text) || /<bash-input>/.test(text))) {
      let combined = '';
      const start = i;
      while (i < entries.length) {
        const t = getEntryText(entries[i]);
        if (!t) break;
        if (i > start && !/<bash-input>|<bash-stdout>|<bash-stderr>|<local-command-caveat>/.test(t)) break;
        combined += t + '\n';
        i++;
        if (/<\/bash-stdout>|<\/bash-stderr>/.test(t)) break;
      }

      const localCmd = parseLocalCommand(combined);
      if (localCmd) {
        result.push({ _localCmd: localCmd, type: 'local-command' });
      } else {
        for (let j = start; j < i; j++) result.push(entries[j]);
      }
    } else {
      result.push(entry);
      i++;
    }
  }
  return result;
}

function mergeLocalCommandBlocks(blocks) {
  const hasLocalCmd = blocks.some(b => b.type === 'text' && b.text && /<bash-input>/.test(b.text));
  if (!hasLocalCmd) return blocks;

  let combined = '';
  for (const b of blocks) {
    if (b.type === 'text' && b.text) combined += b.text + '\n';
  }

  const localCmd = parseLocalCommand(combined);
  if (!localCmd) return blocks;

  const merged = { type: 'text', text: combined, _localCmd: localCmd };
  const result = [];
  let replacedText = false;
  for (const b of blocks) {
    if (b.type === 'text') {
      if (!replacedText) { result.push(merged); replacedText = true; }
    } else {
      result.push(b);
    }
  }
  return result;
}

function extractImages(data) {
  const images = [];
  if (!data) return images;
  if (typeof data === 'string') {
    const imgMatches = data.matchAll(/\{"type"\s*:\s*"image"\s*,\s*"source"\s*:\s*\{[^}]*"data"\s*:\s*"([^"]+)"[^}]*\}/g);
    for (const m of imgMatches) {
      const base64 = m[1];
      const mediaMatch = m[0].match(/"media_type"\s*:\s*"([^"]+)"/);
      const mediaType = mediaMatch ? mediaMatch[1] : 'image/jpeg';
      images.push({ src: `data:${mediaType};base64,${base64}` });
    }
    return images;
  }
  if (Array.isArray(data)) {
    for (const block of data) {
      if (block.type === 'image' && block.source?.data) {
        const mediaType = block.source.media_type || 'image/jpeg';
        images.push({ src: `data:${mediaType};base64,${block.source.data}` });
      }
    }
  }
  return images;
}

function extractResultText(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const cleaned = data.replace(/\{"type"\s*:\s*"image"\s*,\s*"source"\s*:\s*\{[^}]*\}\s*\}/g, '').trim();
    return cleaned || null;
  }
  if (Array.isArray(data)) {
    const texts = data.filter(b => b.type === 'text' || b.text).map(b => b.text || JSON.stringify(b));
    return texts.length ? texts.join('\n') : null;
  }
  return JSON.stringify(data, null, 2);
}

function renderToolResult(resultData) {
  let html = '';
  const textParts = extractResultText(resultData);
  if (textParts) html += makeInlineContent('jsonl-tool-result', textParts);
  for (const img of extractImages(resultData)) {
    html += '<img class="jsonl-tool-screenshot" src="' + img.src + '">';
  }
  return html;
}

// One entry → its markup, or null when the entry contributes nothing (an
// unhandled system subtype, an assistant turn whose blocks all rendered empty).
export function renderJsonlEntry(entry, toolResultMap, opts = {}) {
  if (entry._localCmd) {
    return renderLocalCommand(entry._localCmd);
  }

  const ts = entry.timestamp;
  const timeStr = ts ? new Date(ts).toLocaleTimeString() : '';

  if (entry.type === 'custom-title') {
    return '<div class="jsonl-entry jsonl-meta-entry"><span class="jsonl-meta-icon">T</span> Title set: <strong>' + escapeHtml(entry.customTitle || '') + '</strong></div>';
  }

  if (entry.type === 'system') {
    let inner;
    if (entry.subtype === 'turn_duration') {
      inner = '<span class="jsonl-meta-icon">&#9201;</span> Turn duration: <strong>' + formatDuration(entry.durationMs) + '</strong>'
        + (timeStr ? ' <span class="jsonl-ts">' + timeStr + '</span>' : '');
    } else if (entry.subtype === 'local_command') {
      const cmdMatch = (entry.content || '').match(/<command-name>(.*?)<\/command-name>/);
      const cmd = cmdMatch ? cmdMatch[1] : entry.content || 'unknown';
      inner = '<span class="jsonl-meta-icon">$</span> Command: <code class="jsonl-inline-code">' + escapeHtml(cmd) + '</code>'
        + (timeStr ? ' <span class="jsonl-ts">' + timeStr + '</span>' : '');
    } else {
      return null;
    }
    return '<div class="jsonl-entry jsonl-meta-entry">' + inner + '</div>';
  }

  if (entry.type === 'progress') {
    const data = entry.data;
    if (!data || typeof data !== 'object') return null;
    if (data.type === 'bash_progress') {
      const elapsed = data.elapsedTimeSeconds ? ` (${data.elapsedTimeSeconds}s, ${data.totalLines || 0} lines)` : '';
      let inner = '<span class="jsonl-meta-icon">&#9658;</span> Bash output' + escapeHtml(elapsed);
      if (data.output || data.fullOutput) {
        const output = data.fullOutput || data.output || '';
        inner += makeCollapsible('jsonl-tool-result', 'Output', output, true);
      }
      return '<div class="jsonl-entry jsonl-meta-entry">' + inner + '</div>';
    }
    return null;
  }

  let role = null;
  if (entry.type === 'user' || (entry.type === 'message' && entry.role === 'user')) {
    role = 'user';
  } else if (entry.type === 'assistant' || (entry.type === 'message' && entry.role === 'assistant')) {
    role = 'assistant';
  } else {
    return null;
  }

  let contentBlocks = entry.message?.content || entry.content;
  if (!contentBlocks) return null;
  if (typeof contentBlocks === 'string') {
    contentBlocks = [{ type: 'text', text: contentBlocks }];
  }
  if (!Array.isArray(contentBlocks)) return null;

  contentBlocks = mergeLocalCommandBlocks(contentBlocks);

  const isToolResultOnly = role === 'user' && Array.isArray(contentBlocks) &&
    contentBlocks.every(b => b.type === 'tool_result');
  const visualRole = isToolResultOnly ? 'assistant' : role;

  const children = [];

  for (const block of contentBlocks) {
    if (block.type === 'thinking' && block.thinking) {
      children.push(makeCollapsible('jsonl-thinking', 'Thinking', block.thinking, false));
    } else if (block.type === 'text' && block.text && block.text.trim()) {
      if (block._localCmd) {
        children.push(renderLocalCommand(block._localCmd));
        continue;
      }
      const imgMatch = block.text.trim().match(/^\[Image:\s*source:\s*([^\]]+)\]$/);
      if (imgMatch) {
        children.push('<img class="jsonl-tool-screenshot jsonl-clickable-img" src="file://' + imgMatch[1].trim() + '">');
        continue;
      }
      children.push('<div class="jsonl-text">' + renderText(block.text.trim(), opts.marked) + '</div>');
    } else if (block.type === 'tool_use') {
      const hasResult = block.id != null && toolResultMap && toolResultMap.has(block.id);
      let extra = null;
      if (hasResult) {
        extra = renderToolResult(toolResultMap.get(block.id));
        toolResultMap.delete(block.id);
      }
      children.push(renderToolUse(block, extra));
    } else if (block.type === 'tool_result') {
      if (block.tool_use_id && toolResultMap && !toolResultMap.has(block.tool_use_id)) continue;
      const resultContent = block.content || block.output || '';
      children.push(makeCollapsible('jsonl-tool-result', 'Tool Result', resultContent, false));
    }
  }

  if (!children.length) return null;
  return '<div class="jsonl-entry ' + (visualRole === 'user' ? 'jsonl-user' : 'jsonl-assistant') + '">' + children.join('') + '</div>';
}

// The whole transcript. `count` is the number of entries that produced markup,
// so the Container can show the "No messages found" empty state when it is zero.
export function renderTranscript(rawEntries, opts = {}) {
  const entries = mergeLocalCommandEntries(rawEntries || []);

  const toolResultMap = new Map();
  for (const entry of entries) {
    const blocks = entry.message?.content || entry.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        toolResultMap.set(block.tool_use_id, block.content || block.output || '');
      }
    }
  }

  let html = '';
  let count = 0;
  for (const entry of entries) {
    const el = renderJsonlEntry(entry, toolResultMap, opts);
    if (el != null) { html += el; count++; }
  }
  return { html, count };
}
