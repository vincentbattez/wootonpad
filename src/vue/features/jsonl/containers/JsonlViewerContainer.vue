<template>
  <JsonlPanel
    :title="title"
    :session-id="sessionId"
    :body-html="bodyHtml"
    @image-open="openFullscreen"
  />
</template>

<script setup>
import { ref, watch } from 'vue';
import { jsonlStore } from '../store.js';
import { renderTranscript, escapeHtml } from '../render-jsonl.mjs';
import JsonlPanel from '../components/JsonlPanel.vue';

// The jsonl Feature's edge Container: the one component that reaches the frozen renderer's
// globals. It watches the feature store for an open request, reads the session's JSONL over
// the IPC bridge, turns the entries into markup with the pure render module, and hands the
// Dumb panel its title, id and body. Opening a screenshot fullscreen is a document-level
// side effect, so it lands here rather than in the panel.

const title = ref('Message History');
const sessionId = ref('');
const bodyHtml = ref('');

async function open(session) {
  const result = await window.api.readSessionJsonl(session.sessionId);

  title.value = session.name || session.aiTitle || session.summary || session.sessionId;
  sessionId.value = session.sessionId;

  if (result.error) {
    bodyHtml.value = '<div class="plans-empty">Error loading messages: ' + escapeHtml(result.error) + '</div>';
    return;
  }

  const { html, count } = renderTranscript(result.entries, { marked: window.marked });
  bodyHtml.value = count === 0
    ? '<div class="plans-empty">No messages found in this session.</div>'
    : html;
}

function openFullscreen(src) {
  const overlay = document.createElement('div');
  overlay.className = 'jsonl-screenshot-fullscreen';
  const fullImg = document.createElement('img');
  fullImg.src = src;
  overlay.appendChild(fullImg);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// The bridge writes an open request rather than calling a template-ref method; the
// Container reacts to it here.
watch(() => jsonlStore.openRequest, (req) => { if (req) open(req.session); });
</script>
