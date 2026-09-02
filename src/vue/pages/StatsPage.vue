<template>
  <div id="stats-content" v-show="store.activeTab === 'stats'">
    <div class="plans-empty">Click the Stats tab to view activity heatmap.</div>
  </div>
</template>

<script setup>
// The Stats tab surface in the sidebar column. The heatmap itself renders in the
// main-surface Stats View; this panel is the sidebar placeholder for the tab.
import { store } from '../store.js';
</script>
