<template>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" :fill="filled ? 'currentColor' : 'none'" /><polyline v-if="!filled" points="8 12 11 15 16 9" /></svg>
</template>

<script setup>
defineProps({
  filled: { type: Boolean, default: false },
});
</script>
