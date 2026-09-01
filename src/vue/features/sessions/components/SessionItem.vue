<template>
  <div
    class="session-item"
    :class="itemClasses"
    :id="'si-' + session.sessionId"
    :data-session-id="session.sessionId"
    @click="!renaming && $emit('open', session)"
  >
    <div class="session-row">
      <span class="session-status-dot" :class="{ running: isRunning }"></span>

      <div class="session-info">
        <div class="session-summary" @dblclick.stop="startRename">
          <span v-if="session.type === 'run-terminal'" class="terminal-badge run-terminal-badge"><SessionRunBadgeIcon /></span>
          <span v-else-if="session.type === 'terminal'" class="terminal-badge"><SessionTerminalBadgeIcon /></span>
          <SbEditableLabel
            :editing="renaming"
            :value="renameValue"
            input-class="session-rename-input"
            @submit="submit"
            @cancel="cancel"
          >{{ displayName }}</SbEditableLabel>
        </div>
        <div class="session-meta">{{ timeStr }}{{ msgSuffix }}</div>
      </div>

      <SessionActions
        :compact="compact"
        :is-terminal-like="isTerminalLike"
        :archived="!!session.archived"
        :starred="!!session.starred"
        @stop="$emit('stop', session.sessionId)"
        @fork="$emit('fork', session.sessionId)"
        @jsonl="$emit('jsonl', session.sessionId)"
        @archive="$emit('archive', session.sessionId)"
        @launch-config="$emit('launch-config', session.sessionId)"
        @star="$emit('star', session.sessionId)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { sessionDisplayName, sessionTimeStr } from '../composables/use-session-display.js';
import SessionActions from './SessionActions.vue';
import SessionRunBadgeIcon from '../icons/SessionRunBadgeIcon.vue';
import SessionTerminalBadgeIcon from '../icons/SessionTerminalBadgeIcon.vue';

const props = defineProps({
  session: { type: Object, required: true },
  isActive: Boolean,
  isRunning: Boolean,
  isBusy: Boolean,
  isAttention: Boolean,
  isResponseReady: Boolean,
  // Density only, deliberately untied from `archived` (ADR 0005).
  compact: Boolean,
});

const emit = defineEmits(['open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename']);

const { editing: renaming, draft: renameValue, start, submit, cancel } =
  useInlineRename((name) => emit('rename', props.session.sessionId, name));

function startRename() {
  start(props.session.name || props.session.summary || '');
}

const displayName = computed(() => sessionDisplayName(props.session));
const timeStr = computed(() => sessionTimeStr(props.session));

const msgSuffix = computed(() =>
  props.session.messageCount ? ` · ${props.session.messageCount} msgs` : ''
);

// Neither kind of internal terminal has a .jsonl behind it.
const isTerminalLike = computed(() =>
  props.session.type === 'terminal' || props.session.type === 'run-terminal'
);

const itemClasses = computed(() => ({
  'session-item--row': true,
  active: props.isActive,
  'has-running-pty': props.isRunning,
  'cli-busy': props.isBusy,
  'needs-attention': props.isAttention,
  'response-ready': props.isResponseReady,
  'is-pinned': !!props.session.starred,
  'archived-item': !!props.session.archived,
  'is-terminal': isTerminalLike.value,
  compact: props.compact,
}));
</script>
