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
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span v-if="session.type === 'run-terminal'" class="terminal-badge run-terminal-badge" v-html="runBadgeSvg"></span>
          <span v-else-if="session.type === 'terminal'" class="terminal-badge" v-html="terminalBadgeSvg"></span>
          <template v-if="renaming">
            <input
              ref="renameInput"
              class="session-rename-input"
              type="text"
              :value="renameValue"
              @blur="saveRename"
              @keydown.enter="saveRename"
              @keydown.esc="cancelRename"
            />
          </template>
          <template v-else>{{ displayName }}</template>
        </div>
        <div class="session-meta">{{ timeStr }}{{ msgSuffix }}</div>
      </div>

      <!-- A compact row is an archive entry: unarchive is its only sensible action. -->
      <div v-if="compact" class="session-actions">
        <button class="session-archive-btn" data-tooltip="Unarchive" @click.stop="$emit('archive', session.sessionId)" v-html="archiveSvg"></button>
      </div>

      <div v-else class="session-actions">
        <button class="session-stop-btn" data-tooltip="Stop session" @click.stop="$emit('stop', session.sessionId)" v-html="stopSvg"></button>
        <template v-if="!isTerminalLike">
          <button class="session-fork-btn" data-tooltip="Fork session" @click.stop="$emit('fork', session.sessionId)" v-html="forkSvg"></button>
          <button class="session-jsonl-btn" data-tooltip="View messages" @click.stop="$emit('jsonl', session.sessionId)" v-html="jsonlSvg"></button>
          <button class="session-archive-btn" :data-tooltip="session.archived ? 'Unarchive' : 'Archive'" @click.stop="$emit('archive', session.sessionId)" v-html="archiveSvg"></button>
          <button class="session-launch-config-btn" data-tooltip="Resume with config" @click.stop="$emit('launch-config', session.sessionId)" v-html="launchConfigSvg"></button>
        </template>
        <span class="session-pin" :class="{ pinned: session.starred }" @click.stop="$emit('star', session.sessionId)" v-html="pinSvg"></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue';
import { sessionItemIcons } from '../shared/lib/icons.js';
const { stopSvg, forkSvg, jsonlSvg, archiveSvg, launchConfigSvg, terminalBadgeSvg, runBadgeSvg } = sessionItemIcons;

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

const renaming = ref(false);
const renameValue = ref('');
const renameInput = ref(null);

const displayName = computed(() => {
  const name = props.session.name || props.session.summary;
  return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
});

const cleanName = (n) => window.cleanDisplayName ? window.cleanDisplayName(n) : n;

const timeStr = computed(() => {
  const t = window.lastActivityTime?.get(props.session.sessionId) || new Date(props.session.modified);
  return window.formatDate ? window.formatDate(t) : '';
});

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

function startRename() {
  renameValue.value = props.session.name || props.session.summary || '';
  renaming.value = true;
  nextTick(() => renameInput.value?.focus());
}

async function saveRename() {
  if (!renaming.value) return;
  renaming.value = false;
  const name = renameInput.value?.value?.trim() ?? null;
  emit('rename', props.session.sessionId, name || null);
}

function cancelRename() {
  renaming.value = false;
}

const pinSvg = computed(() => props.session.starred
  ? sessionItemIcons.pinFilledSvg
  : sessionItemIcons.pinOutlineSvg
);
</script>
