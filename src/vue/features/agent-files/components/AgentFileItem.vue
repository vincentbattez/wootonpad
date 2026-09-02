<template>
  <!-- The file row shared by the Plans and the Memory panels. A Dumb Component: it takes the
       flat row model and emits `open`/`run`, leaving the Container to open the file or run the
       schedule. The class names are the legacy ones, preserved verbatim. -->
  <div
    class="session-item"
    :class="[itemClass, { active }]"
    :id="itemId"
    @click="$emit('open')"
  >
    <div class="session-row">
      <span :class="iconClass">
        <AgentFilePlanIcon v-if="variant === 'plan'" />
        <AgentFileScheduleIcon v-else-if="variant === 'schedule'" />
        <AgentFileBrainIcon v-else />
      </span>
      <div class="session-info">
        <div class="session-summary">{{ title }}</div>
        <div v-if="subtitle" class="session-subtitle">{{ subtitle }}</div>
        <div v-if="meta" class="session-meta">{{ meta }}</div>
      </div>
      <button
        v-if="runnable"
        class="schedule-play-btn"
        :class="{ running: runState === 'running', done: runState === 'done' }"
        title="Run now"
        @click.stop="$emit('run')"
      >
        <AgentFileSpinnerIcon v-if="runState === 'running'" />
        <AgentFileCheckIcon v-else-if="runState === 'done'" />
        <AgentFilePlayIcon v-else />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import AgentFilePlanIcon from '../icons/AgentFilePlanIcon.vue';
import AgentFileBrainIcon from '../icons/AgentFileBrainIcon.vue';
import AgentFileScheduleIcon from '../icons/AgentFileScheduleIcon.vue';
import AgentFilePlayIcon from '../icons/AgentFilePlayIcon.vue';
import AgentFileSpinnerIcon from '../icons/AgentFileSpinnerIcon.vue';
import AgentFileCheckIcon from '../icons/AgentFileCheckIcon.vue';

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: null },
  meta: { type: String, default: null },
  active: { type: Boolean, default: false },
  itemId: { type: String, default: undefined },
  // 'plan' | 'memory' | 'schedule' — picks the leading icon and the row's legacy class.
  variant: { type: String, default: 'memory' },
  runnable: { type: Boolean, default: false },
  // 'idle' | 'running' | 'done' — the schedule run button's state.
  runState: { type: String, default: 'idle' },
});

defineEmits(['open', 'run']);

const itemClass = computed(() => (props.variant === 'plan' ? 'plan-item' : 'memory-item'));
const iconClass = computed(() => (props.variant === 'schedule' ? 'memory-schedule-icon' : 'memory-brain-icon'));
</script>
