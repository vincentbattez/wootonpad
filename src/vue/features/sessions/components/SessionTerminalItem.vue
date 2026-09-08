<template>
  <div
    class="session-item session-terminal-item"
    :class="{ active: isActive, 'has-running-pty': isRunning, 'is-terminal': true }"
    :id="'si-' + session.sessionId"
    :data-session-id="session.sessionId"
    @click="!renaming && $emit('open', session)"
  >
    <div class="session-row">
      <!-- A Terminal has no .jsonl behind it: no State Dot, no date, no message count, no
           context gauge, no fork, no archive. The type badge stays so a Run Terminal still
           reads apart from a Plain Terminal, and the row keeps its own actions (Stop, open). -->
      <span
        v-if="session.type === 'run-terminal'"
        class="terminal-badge run-terminal-badge"
      ><SessionRunBadgeIcon /></span>
      <span v-else class="terminal-badge"><SessionTerminalBadgeIcon /></span>

      <div class="session-info">
        <div class="session-summary" @dblclick.stop="startRename">
          <SbEditableLabel
            :editing="renaming"
            :value="renameValue"
            input-class="session-rename-input"
            @submit="submit"
            @cancel="cancel"
          >{{ displayName }}</SbEditableLabel>
        </div>
      </div>

      <div class="session-actions">
        <SessionStopButton @stop="$emit('stop', session.sessionId)" />
      </div>
    </div>
  </div>
</template>

<script setup>
// The compact line for a Plain Terminal or a Run Terminal — one row, no Session State. It sits
// beside SessionItem and leans on the same row Primitives; the list picks between the two on
// the entry's `type`. A Dumb Component (ADR 0008): props in, emits out, reaching no store,
// no service and no global.
import { computed } from 'vue';
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { sessionDisplayName } from '../composables/use-session-display.js';
import SessionStopButton from './actions/SessionStopButton.vue';
import SessionRunBadgeIcon from '../icons/SessionRunBadgeIcon.vue';
import SessionTerminalBadgeIcon from '../icons/SessionTerminalBadgeIcon.vue';

const props = defineProps({
  session: { type: Object, required: true },
  isActive: Boolean,
  isRunning: Boolean,
});

const emit = defineEmits(['open', 'stop', 'rename']);

const { editing: renaming, draft: renameValue, start, submit, cancel } =
  useInlineRename((name) => emit('rename', props.session.sessionId, name));

function startRename() {
  start(props.session.name || props.session.summary || '');
}

const displayName = computed(() => sessionDisplayName(props.session));
</script>
