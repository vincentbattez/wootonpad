<template>
  <!-- The Dumb editor surface: the host the editor mounts into, plus the rendered preview beside
       it. It holds no CodeMirror, no file watching and no IPC — the Container drives those into
       the exposed editor host — so anything that needs to show a file can render it with fixed
       content. Class names come verbatim from the legacy viewer so the global stylesheet is
       unchanged. -->
  <div ref="editorEl" class="viewer-panel-editor" :style="previewMode ? { display: 'none' } : {}"></div>
  <div class="markdown-preview" v-show="previewMode" v-html="previewHtml"></div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  previewMode: { type: Boolean, default: false },
  previewHtml: { type: String, default: '' },
});

const editorEl = ref(null);

// The Container mounts CodeMirror into this host and listens for its cm-save.
defineExpose({ editorEl });
</script>
