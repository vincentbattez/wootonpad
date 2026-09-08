<template>
  <div
    class="session-item"
    :class="itemClasses"
    :id="'si-' + session.sessionId"
    :data-session-id="session.sessionId"
    @click="!renaming && $emit('open', session)"
  >
    <div class="session-row">
      <span
        v-if="state"
        class="session-state-dot"
        :class="'state-' + state"
      ></span>

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
        <div class="session-meta">
          <span class="session-meta-text">{{ timeStr }}{{ msgSuffix }}</span>
          <SessionContextGauge
            compact
            :usage="session.contextUsage"
            :model="session.contextModel"
          />
        </div>
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
import { sessionStateFor } from '../session-state.mjs';
import SessionActions from './SessionActions.vue';
import SessionContextGauge from './SessionContextGauge.vue';
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

// The State Dot renders exactly this — one value of four, or null for a terminal-like row.
// `needsInput` unites the two signals the app already carries: an OSC 9 attention/permission
// notification, and a turn that just ended on an unfocused Session (the old `response-ready`).
// `isRunning` (a live PTY) is deliberately not passed — it is not a Session State (ADR 0015).
const state = computed(() => sessionStateFor({
  type: props.session.type,
  done: !!props.session.done,
  isBusy: props.isBusy,
  isAttention: props.isAttention || props.isResponseReady,
}));

const msgSuffix = computed(() =>
  props.session.messageCount ? ` · ${props.session.messageCount} msgs` : ''
);

// Neither kind of internal terminal has a .jsonl behind it.
const isTerminalLike = computed(() =>
  props.session.type === 'terminal' || props.session.type === 'run-terminal'
);

// The item classes drive row chrome only — the Stop button, the pin border, the title's
// busy shimmer and its Unread accent. The Session State no longer rides here as a stack of
// booleans: it lives on the single State Dot class above (`state-*`). `response-ready` is
// kept for the Unread accent on the title (decoupled from the dot); `cli-busy` for its
// shimmer. There is deliberately no `needs-attention` chrome any more.
const itemClasses = computed(() => ({
  'session-item--row': true,
  active: props.isActive,
  'has-running-pty': props.isRunning,
  'cli-busy': props.isBusy,
  'response-ready': props.isResponseReady,
  'is-pinned': !!props.session.starred,
  'archived-item': !!props.session.archived,
  'is-terminal': isTerminalLike.value,
  compact: props.compact,
}));
</script>
