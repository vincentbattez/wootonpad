<template>
  <!-- The common dialog shell: an overlay teleported to the body with a centred box. Both class
       names come from the caller so the global stylesheet keeps styling each dialog as before;
       clicking the backdrop (but not the box) emits close. -->
  <Teleport to="body">
    <div v-if="open" :class="overlayClass" @mousedown.self="$emit('close')">
      <div :class="dialogClass">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  overlayClass: { type: String, required: true },
  dialogClass: { type: String, required: true },
});
defineEmits(['close']);
</script>
