<template>
  <template v-for="[sessionId, card] in activeCards" :key="sessionId">
    <Teleport :to="card.headerEl">
      <span
        class="grid-card-avatar"
        :class="card.busy ? 'busy' : card.running ? 'running' : 'stopped'"
        :style="{ background: card.color }"
      >{{ card.initials }}</span>
      <span class="grid-card-name">{{ card.name }}</span>
      <span class="grid-card-project">{{ card.project }}</span>
      <button
        v-if="card.running"
        class="grid-card-stop-btn"
        data-tooltip="Stop session"
        @click.stop="stop(sessionId)"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
          <rect x="2" y="2" width="8" height="8" rx="1"/>
        </svg>
      </button>
    </Teleport>
    <Teleport :to="card.footerEl">
      <span>{{ card.running ? 'Running' : 'Stopped' }}</span>
      <span>{{ card.time }}</span>
    </Teleport>
  </template>
</template>

<script setup>
import { gridStore } from '../stores/grid.js';

// Read the feature store the grid bridge writes; no local map, no setters.
const activeCards = gridStore.cards;

function stop(sessionId) {
  window.confirmAndStopSession?.(sessionId);
}
</script>
