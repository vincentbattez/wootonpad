<template>
  <div
    class="session-item terminal-item"
    :class="itemClasses"
    :id="'si-' + session.sessionId"
    :data-session-id="session.sessionId"
    @click="!renaming && $emit('open', session)"
  >
    <div class="session-row">
      <span class="terminal-badge" :class="{ 'run-terminal-badge': isRunTerminal }">
        <SessionRunBadgeIcon v-if="isRunTerminal" />
        <SessionTerminalBadgeIcon v-else />
      </span>

      <div class="session-summary" @dblclick.stop="startRename">
        <SbEditableLabel
          :editing="renaming"
          :value="renameValue"
          input-class="session-rename-input"
          @submit="submit"
          @cancel="cancel"
        >{{ displayName }}</SbEditableLabel>
      </div>

      <div class="session-actions">
        <SessionStopButton @stop="$emit('stop', session.sessionId)" />
        <SessionPinButton :starred="!!session.starred" @star="$emit('star', session.sessionId)" />
      </div>
    </div>
  </div>
</template>

<script setup>
// The row of a Plain Terminal or a Run Terminal: one line, its type badge, its editable name
// and its own two actions. No date, no message count, no context gauge, no State Dot, no fork
// and no archive — a Terminal has no `.jsonl` behind it and no Session State to render. Its
// liveness is carried by the Stop button, which is the only thing that ever reported it.
import { computed } from 'vue';
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { sessionDisplayName } from '../composables/use-session-display.js';
import SessionStopButton from './actions/SessionStopButton.vue';
import SessionPinButton from './actions/SessionPinButton.vue';
import SessionRunBadgeIcon from '../icons/SessionRunBadgeIcon.vue';
import SessionTerminalBadgeIcon from '../icons/SessionTerminalBadgeIcon.vue';

const props = defineProps({
  session: { type: Object, required: true },
  isActive: Boolean,
  isRunning: Boolean,
});

const emit = defineEmits(['open', 'stop', 'star', 'rename']);

const { editing: renaming, draft: renameValue, start, submit, cancel } =
  useInlineRename((name) => emit('rename', props.session.sessionId, name));

function startRename() {
  start(props.session.name || props.session.summary || '');
}

const displayName = computed(() => sessionDisplayName(props.session));
const isRunTerminal = computed(() => props.session.type === 'run-terminal');

const itemClasses = computed(() => ({
  active: props.isActive,
  'has-running-pty': props.isRunning,
  'is-pinned': !!props.session.starred,
}));
</script>
