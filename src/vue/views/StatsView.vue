<template>
  <div id="stats-viewer" v-show="store.showStats">
    <div id="stats-viewer-header">
      <span id="stats-viewer-title">Activity</span>
      <button
        class="stats-refresh-btn"
        :class="{ 'stats-refresh-spinning': statsRef?.isRefreshing }"
        :disabled="statsRef?.isRefreshing"
        title="Refresh stats (runs claude /stats)"
        @click="statsRef?.refreshAll()"
        v-html="STATS_REFRESH_SVG"
      ></button>
    </div>
    <StatsContainer ref="statsRef" />
  </div>
</template>

<script setup>
// The Stats main surface: the Activity heatmap Container plus its refresh header. The
// refresh button drives the Container's exposed refresh state; the maths and the IPC
// live in the stats Feature, not here.
import { ref } from 'vue';
import { appIcons } from '../shared/lib/icons.js';
import { store } from '../store.js';
import StatsContainer from '../features/stats/containers/StatsContainer.vue';
const { STATS_REFRESH_SVG } = appIcons;
const statsRef = ref(null);
</script>
