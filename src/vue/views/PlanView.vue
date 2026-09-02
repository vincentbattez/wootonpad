<template>
  <div id="plan-viewer" v-show="store.planViewerOpen">
    <ViewerContainer
      ref="viewerRef"
      language="markdown"
      storage-key="markdownPreviewMode"
      :show-copy-path="true"
      :show-copy-content="true"
      :on-save="planOnSave"
    />
  </div>
</template>

<script setup>
// The Plan main surface: the shared viewer Container in markdown mode. It exposes open()
// so the shell can wire window.vuePlanViewer to it, keeping the plan/memory viewers'
// template-ref setters (ADR 0010).
import { ref } from 'vue';
import { store } from '../store.js';
import { api } from '../shared/services/api.js';
import ViewerContainer from '../features/viewer/containers/ViewerContainer.vue';

const viewerRef = ref(null);
const planOnSave = (filePath, content) => api.savePlan(filePath, content);
defineExpose({ open: (...args) => viewerRef.value?.open(...args) });
</script>
