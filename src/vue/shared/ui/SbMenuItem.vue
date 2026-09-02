<template>
  <button type="button" class="context-menu-item" :class="{ danger }" @click="menu.close(); $emit('select')">
    <slot />
  </button>
</template>

<script setup>
import { inject } from 'vue';

// A row inside an SbContextMenu. It injects the menu it lives in — without a default — so a
// menu item used outside its parent throws on first render rather than lying semantically.
// Selecting a row closes the menu, then emits `select` for the caller to act on.
const menu = inject('sbContextMenu');
defineProps({
  danger: { type: Boolean, default: false },
});
defineEmits(['select']);
</script>
