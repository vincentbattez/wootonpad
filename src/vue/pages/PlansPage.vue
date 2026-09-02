<template>
  <!-- The Plans list is Teleported into this panel from the agent-files Feature's Container. -->
  <div id="plans-content" v-show="store.activeTab === 'plans'"></div>
</template>

<script setup>
// The Plans tab surface. Its rows are owned by the agent-files Feature, whose Container
// Teleports them into this mount point, so the Page carries only the panel itself.
import { store } from '../store.js';
</script>
