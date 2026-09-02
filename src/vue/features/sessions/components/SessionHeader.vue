<template>
  <div v-if="session" class="vue-session-header">
    <div class="vsh-top">
      <div class="vsh-identity">
        <SbAvatar
          class="vsh-avatar"
          :data-url="avatar.dataUrl"
          :alt="avatar.alt"
          :initials="avatar.initials"
          :color="avatar.color"
        />
        <div class="vsh-info">
          <div class="vsh-title-row">
            <span class="vsh-project-path" :title="session.projectPath">{{ projectShortPath }}</span>
            <span class="vsh-sep">›</span>
            <span class="vsh-session-name" :title="sessionName">{{ sessionName }}</span>
          </div>
          <div class="vsh-status-row">
            <span class="vsh-status-dot" :class="statusClass"></span>
            <span class="vsh-status-label">{{ statusLabel }}</span>
            <template v-if="messageCount">
              <span class="vsh-dot-sep">·</span>
              <span class="vsh-msg-count">{{ messageCount }} msgs</span>
            </template>
            <template v-if="timeStr">
              <span class="vsh-dot-sep">·</span>
              <span class="vsh-time">{{ timeStr }}</span>
            </template>
            <template v-if="sessionId">
              <span class="vsh-dot-sep">·</span>
              <span class="vsh-session-id">{{ shortId }}</span>
            </template>
          </div>
          <div v-if="aiTitle || ptyTitle" class="vsh-subtitle-row">
            <span v-if="aiTitle" class="vsh-ai-title">{{ aiTitle }}</span>
            <span v-if="ptyTitle" class="vsh-pty-title">{{ ptyTitle }}</span>
          </div>
        </div>
      </div>
      <div class="vsh-controls">
        <span v-if="account" class="terminal-account-badge">{{ account }}</span>
        <span v-if="shellProfile" class="vsh-shell-badge">{{ shellProfile }}</span>
        <button class="session-stop-btn vsh-stop" data-tooltip="Stop session" @click="$emit('stop')"><SessionStopIcon /></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbAvatar from '../../../shared/ui/SbAvatar.vue';
import SessionStopIcon from '../icons/SessionStopIcon.vue';

// The terminal header for the active Session. Dumb: it takes the Session plus its already-resolved
// name, AI title, time and live status, and emits `stop`. The pure pieces — the shortened project
// path, the short id, the status class and label — it derives itself from the props.
const props = defineProps({
  session: { type: Object, default: null },
  sessionName: { type: String, default: '' },
  aiTitle: { type: String, default: null },
  timeStr: { type: String, default: '' },
  isRunning: { type: Boolean, default: false },
  isBusy: { type: Boolean, default: false },
  isAttention: { type: Boolean, default: false },
  ptyTitle: { type: String, default: null },
  account: { type: String, default: null },
  shellProfile: { type: String, default: null },
  avatar: { type: Object, default: () => ({ dataUrl: null, alt: '', initials: '', color: '' }) },
});

defineEmits(['stop']);

const sessionId = computed(() => props.session?.sessionId);

const projectShortPath = computed(() => {
  const p = props.session?.projectPath || '';
  return p.split('/').filter(Boolean).slice(-2).join('/');
});

const messageCount = computed(() => props.session?.messageCount || null);

const shortId = computed(() => (sessionId.value || '').slice(0, 8));

const statusClass = computed(() => ({
  running: props.isRunning,
  busy: props.isBusy,
  attention: props.isAttention,
}));

const statusLabel = computed(() => {
  if (props.isAttention) return 'Needs attention';
  if (props.isBusy) return 'Working…';
  if (props.isRunning) return 'Running';
  return 'Stopped';
});
</script>
