<template>
  <Teleport to="body">
    <div v-if="open" class="context-menu" :style="style">
      <slot />
    </div>
  </Teleport>
</template>

<script setup>
import { provide } from 'vue';

// The context-menu panel, teleported to <body> so a scrolling row cannot clip it. It provides
// itself to the SbMenuItem rows nested in its slot, so a row can close the menu on select. The
// open flag and the anchoring live in the useContextMenu composable the caller drives; this
// primitive only positions and shows the panel and invents no class of its own.
const props = defineProps({
  open: { type: Boolean, default: false },
  style: { type: Object, default: () => ({}) },
  close: { type: Function, default: () => {} },
});

provide('sbContextMenu', { close: () => props.close() });
</script>
