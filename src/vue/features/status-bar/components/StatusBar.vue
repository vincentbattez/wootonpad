<template>
  <span>{{ info }}</span>
  <span :class="activityClass">{{ activity }}</span>
  <span>{{ updater }}</span>
</template>

<script setup>
// Dumb status bar: three text slots handed in as props. The bridge owns the text
// and the auto-clear timers; this component only renders.
defineProps({
  info: { type: String, default: '' },
  activity: { type: String, default: '' },
  activityClass: { type: String, default: '' },
  updater: { type: String, default: '' },
});
</script>
