<template>
  <input
    v-if="editing"
    ref="inputRef"
    :class="inputClass"
    type="text"
    :value="value"
    @blur="$emit('submit', $event.target.value)"
    @keydown.enter="$emit('submit', $event.target.value)"
    @keydown.esc="$emit('cancel')"
  />
  <slot v-else />
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

// The editable-label primitive: it shows its default slot until `editing` turns on, then an
// <input> seeded with `value`, focused on the next tick. It carries no rename state of its
// own — the useInlineRename composable owns that and maps `submit` / `cancel` back — so
// Project, Area, Session and Account rename through one input. The input class is passed in
// verbatim; the primitive invents none.
defineProps({
  editing: { type: Boolean, default: false },
  value: { type: String, default: '' },
  inputClass: { type: String, default: '' },
});
defineEmits(['submit', 'cancel']);

const inputRef = ref(null);
watch(() => inputRef.value, (el) => { if (el) nextTick(() => el.focus()); });
</script>
