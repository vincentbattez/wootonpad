<template>
  <Teleport :to="headerEl">
    <SbAvatar
      class="grid-card-avatar"
      :class="statusClass"
      :initials="initials"
      :color="color"
    />
    <span class="grid-card-name">{{ name }}</span>
    <span class="grid-card-project">{{ project }}</span>
    <button
      v-if="running"
      class="grid-card-stop-btn"
      data-tooltip="Stop session"
      @click.stop="$emit('stop')"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
        <rect x="2" y="2" width="8" height="8" rx="1"/>
      </svg>
    </button>
  </Teleport>
  <Teleport :to="footerEl">
    <span>{{ running ? 'Running' : 'Stopped' }}</span>
    <span>{{ time }}</span>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import SbAvatar from '../../../shared/ui/SbAvatar.vue';

// One Session-overview card. The frozen grid renderer wraps a live terminal with a header and
// a footer element; this Dumb Component teleports the reactive card chrome into both. It reuses
// the shared SbAvatar the sessions Feature renders its Session avatar with, rather than
// hand-rolling a second avatar span, and forwards the stop click as an event.
const props = defineProps({
  headerEl: { type: Object, required: true },
  footerEl: { type: Object, required: true },
  name: { type: String, default: '' },
  project: { type: String, default: '' },
  initials: { type: String, default: '' },
  color: { type: String, default: '' },
  running: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  time: { type: String, default: '' },
});

defineEmits(['stop']);

const statusClass = computed(() => (props.busy ? 'busy' : props.running ? 'running' : 'stopped'));
</script>
