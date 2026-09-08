<template>
  <svg v-if="filled" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.78 5.97a.75.75 0 0 0-1.06-.02L7.1 9.44 5.28 7.62a.75.75 0 1 0-1.06 1.06l2.35 2.35a.75.75 0 0 0 1.07-.01l4.16-4.31a.75.75 0 0 0-.02-.74z" /></svg>
  <svg v-else width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="6.6" /><path d="M5.2 8.2 7.1 10.1l3.7-3.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
</template>

<script setup>
// The State Dot's manual companion: a check marking a Session declared done (ADR 0015).
// Filled when the Session is done, an outline otherwise.
defineProps({
  filled: { type: Boolean, default: false },
});
</script>
