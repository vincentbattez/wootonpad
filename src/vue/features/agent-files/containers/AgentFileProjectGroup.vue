<template>
  <AgentFileGroup
    :label="label"
    :files="files"
    :collapsible="true"
    :show-count="true"
    :avatar="avatar"
    @open="$emit('open', $event)"
    @run="$emit('run', $event)"
  />
</template>

<script setup>
import { computed, toRef } from 'vue';
import { useProjectAvatar } from '../../../shared/composables/use-avatar.js';
import AgentFileGroup from '../components/AgentFileGroup.vue';

// An inner Container for one Memory Project group: it resolves the Project avatar through the
// shared composable — the one place that fetches and caches it — and hands the Dumb group its
// rows and the resolved avatar. It reaches for no service; the edge Container passes the rows
// down and the emits back up.
const props = defineProps({
  label: { type: String, required: true },
  projectPath: { type: String, required: true },
  files: { type: Array, default: () => [] },
});

defineEmits(['open', 'run']);

const { dataUrl, fallback } = useProjectAvatar(toRef(props, 'projectPath'));
const avatar = computed(() => ({
  dataUrl: dataUrl.value,
  alt: props.projectPath.split('/').filter(Boolean).pop() || '',
  initials: fallback.value.initials,
  color: fallback.value.color,
}));
</script>
