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
import { computed, toRef } from 'vue';
import SbAvatar from '../../../shared/ui/SbAvatar.vue';
import { useProjectAvatar } from '../../../shared/composables/use-avatar.js';

// The Project avatar: the shared SbAvatar primitive fed by the shared useProjectAvatar composable,
// which owns the IPC fetch and the store cache. A stored image (fetched once, cached by Project
// path) with an initials-and-colour fallback derived from the last path segment — no fifth copy of
// the fetch-and-cache dance.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  projectPath: { type: String, required: true },
});

const name = computed(() => props.projectPath.split('/').filter(Boolean).pop() || '');
const { dataUrl, fallback } = useProjectAvatar(toRef(props, 'projectPath'));
</script>
