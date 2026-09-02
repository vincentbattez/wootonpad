<template>
  <!-- The Memory (Agent Files) tree is Teleported into this panel from the agent-files Container. -->
  <div id="memory-content" v-show="store.activeTab === 'memory'"></div>
</template>

<script setup>
// The Agent Files (memory) tab surface. Its tree is owned by the agent-files Feature,
// whose Container Teleports it into this mount point, so the Page carries only the panel.
import { store } from '../store.js';
</script>
