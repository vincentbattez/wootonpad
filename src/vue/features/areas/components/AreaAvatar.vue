<template>
  <SbAvatar
    v-bind="$attrs"
    :data-url="dataUrl"
    :alt="name"
    :initials="fallback.initials"
    :color="fallback.color"
  />
</template>

<script setup>
import { toRef } from 'vue';
import SbAvatar from '../../../shared/ui/SbAvatar.vue';
import { useAreaAvatar } from '../../../shared/composables/use-avatar.js';

// The Area avatar: the shared SbAvatar primitive fed by the shared useAreaAvatar composable, which
// owns the IPC fetch and the store cache. A stored image (fetched once, cached by Area id) with an
// initials-and-colour fallback derived from the Area's free-form name (VIN-82) — no fifth copy of
// the fetch-and-cache dance.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  areaId: { type: String, required: true },
  name: { type: String, default: '' },
});

const { dataUrl, fallback } = useAreaAvatar(toRef(props, 'areaId'), toRef(props, 'name'));
</script>
