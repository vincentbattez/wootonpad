<template>
  <div class="slug-group-header" @click.self="$emit('toggle')">
    <div class="slug-group-row">
      <span class="slug-group-expand" @click.stop="$emit('toggle')">
        <span class="arrow">&#9654;</span>
      </span>
      <div class="slug-group-info" @click="$emit('toggle')">
        <div class="slug-group-name">{{ displayName }}</div>
        <div class="slug-group-meta">
          <span class="slug-group-dot" :class="{ running: hasRunning }"></span>
          <span class="slug-group-count">{{ sessions.length }} sessions</span>
          {{ ' ' + timeStr }}
        </div>
      </div>
      <button class="slug-group-archive-btn" data-tooltip="Archive all sessions in group" @click.stop="$emit('archive-all')" v-html="archiveSvg"></button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { slugGroupIcons } from '../../../shared/lib/icons.js';
import { slugMostRecent, slugDisplayName, slugTimeStr } from '../composables/use-project-display.js';
const { archiveSvg } = slugGroupIcons;

// The Slug group's header row: its name, running dot, session count and timestamp, plus the
// archive-all action. A Dumb Component — it derives its display strings through the Feature's
// display composable (which reads the frozen renderer's clock), and emits `toggle` and `archive-all`
// for the SlugGroup wrapper to act on. The list of Session rows is a separate component.
const props = defineProps({
  slug: { type: String, required: true },
  sessions: { type: Array, required: true },
  activePtyIds: { type: Set, required: true },
});

defineEmits(['toggle', 'archive-all']);

const mostRecent = computed(() => slugMostRecent(props.sessions));
const displayName = computed(() => slugDisplayName(mostRecent.value, props.slug));
const timeStr = computed(() => slugTimeStr(mostRecent.value));
const hasRunning = computed(() => props.sessions.some(s => props.activePtyIds.has(s.sessionId)));
</script>
