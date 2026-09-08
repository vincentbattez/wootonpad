<template>
  <div
    class="session-item"
    :class="itemClasses"
    :id="'si-' + session.sessionId"
    :data-session-id="session.sessionId"
    @click="!renaming && $emit('open', session)"
  >
    <div class="session-row">
      <span class="session-state-dot" :class="dotClass"></span>

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
        :archived="!!session.archived"
        :starred="!!session.starred"
        :done="!!session.done"
        @stop="$emit('stop', session.sessionId)"
        @fork="$emit('fork', session.sessionId)"
        @jsonl="$emit('jsonl', session.sessionId)"
        @archive="$emit('archive', session.sessionId)"
        @launch-config="$emit('launch-config', session.sessionId)"
        @star="$emit('star', session.sessionId)"
        @done="$emit('done', session.sessionId)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { sessionDisplayName, sessionTimeStr } from '../composables/use-session-display.js';
import { sessionStateFor, stateDotClass } from '../session-state.mjs';
import SessionActions from './SessionActions.vue';
import SessionContextGauge from './SessionContextGauge.vue';

const props = defineProps({
  session: { type: Object, required: true },
  isActive: Boolean,
  isRunning: Boolean,
  isBusy: Boolean,
  isAttention: Boolean,
  isUnread: Boolean,
  // Density only, deliberately untied from `archived` (ADR 0005).
  compact: Boolean,
});

const emit = defineEmits(['open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename', 'done']);

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

// The two needs-input signals join here and nowhere else: the OSC 9 approval/permission
// notification, and the turn that ended off-focus. Unread also rides the second one, but it
// is a reading state, not a Session State — it accents the title, never the dot.
const sessionState = computed(() => sessionStateFor({
  type: props.session.type,
  done: !!props.session.done,
  isBusy: props.isBusy,
  isAttention: props.isAttention || props.isUnread,
}));

const dotClass = computed(() => stateDotClass(sessionState.value));

const itemClasses = computed(() => ({
  'session-item--row': true,
  active: props.isActive,
  // Not a Session State: the row's Stop button reads it, the State Dot never does.
  'has-running-pty': props.isRunning,
  'is-unread': props.isUnread,
  'is-pinned': !!props.session.starred,
  'archived-item': !!props.session.archived,
  compact: props.compact,
}));
</script>
