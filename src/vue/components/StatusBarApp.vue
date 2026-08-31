<template>
  <span>{{ statusBarStore.info }}</span>
  <span :class="statusBarStore.activityClass">{{ statusBarStore.activity }}</span>
  <span>{{ statusBarStore.updater }}</span>
</template>

<script setup>
// A pure reader of the status-bar feature store. The bridge owns the text and
// the auto-clear timers; this component only renders the three slots.
import { statusBarStore } from '../stores/status-bar.js';
</script>
