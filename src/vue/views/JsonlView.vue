<template>
  <div id="jsonl-viewer" v-show="store.showJsonl">
    <JsonlViewerContainer />
  </div>
</template>

<script setup>
// The Message History (JSONL) main surface: assembles the jsonl Feature's Container.
import { store } from '../store.js';
import JsonlViewerContainer from '../features/jsonl/containers/JsonlViewerContainer.vue';
</script>
