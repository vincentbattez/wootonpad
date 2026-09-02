<template>
  <div id="memory-viewer" v-show="store.memoryViewerOpen">
    <ViewerContainer
      ref="viewerRef"
      language="markdown"
      storage-key="markdownPreviewMode"
      :show-copy-path="true"
      :show-copy-content="true"
      :on-save="memoryOnSave"
    />
  </div>
</template>

<script setup>
// The Memory (Agent File) main surface: the shared viewer Container in markdown mode.
// It exposes open() so the shell can wire window.vueMemoryViewer to it (ADR 0010).
import { ref } from 'vue';
import { store } from '../store.js';
import { api } from '../shared/services/api.js';
import ViewerContainer from '../features/viewer/containers/ViewerContainer.vue';

const viewerRef = ref(null);
const memoryOnSave = (filePath, content) => api.saveMemory(filePath, content);
defineExpose({ open: (...args) => viewerRef.value?.open(...args) });
</script>
