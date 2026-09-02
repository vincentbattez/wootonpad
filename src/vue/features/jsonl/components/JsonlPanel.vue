<template>
  <div id="jsonl-viewer-header">
    <span id="jsonl-viewer-title">{{ title }}</span>
    <span id="jsonl-viewer-session-id">{{ sessionId }}</span>
  </div>
  <div id="jsonl-viewer-body" ref="body" v-html="bodyHtml" @click="onBodyClick"></div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

// The Message History shell: a header with the session's title and id, and the body it
// paints the pre-rendered transcript markup into. Dumb — it takes the markup as a prop and
// owns only presentation: the collapsible toggles that the transcript ships collapsed, and
// scrolling to the newest message. Opening a screenshot fullscreen escapes the panel, so
// it emits `image-open` for the Container to handle. The element IDs are preserved verbatim
// because the frozen renderer queries these nodes.

const props = defineProps({
  title: { type: String, default: 'Message History' },
  sessionId: { type: String, default: '' },
  bodyHtml: { type: String, default: '' },
});

const emit = defineEmits(['image-open']);

const body = ref(null);

function onBodyClick(e) {
  const toggle = e.target.closest('.jsonl-toggle');
  if (toggle && body.value?.contains(toggle)) {
    const pane = toggle.nextElementSibling;
    if (pane) {
      const showing = pane.style.display !== 'none';
      pane.style.display = showing ? 'none' : '';
      toggle.classList.toggle('expanded', !showing);
    }
    return;
  }
  const img = e.target.closest('img.jsonl-tool-screenshot');
  if (img && body.value?.contains(img)) emit('image-open', img.src);
}

// New content scrolls to the newest message, matching the legacy viewer.
watch(() => props.bodyHtml, async () => {
  await nextTick();
  if (body.value) body.value.scrollTop = body.value.scrollHeight;
});
</script>
