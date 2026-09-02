<template>
  <SessionHeader
    :session="session"
    :session-name="sessionName"
    :ai-title="aiTitle"
    :time-str="timeStr"
    :is-running="isRunning"
    :is-busy="isBusy"
    :is-attention="isAttention"
    :pty-title="headerStore.headerPtyTitle"
    :account="headerStore.headerAccount"
    :shell-profile="headerStore.headerShellProfile"
    :avatar="avatar"
    @stop="onStop"
  />
</template>

<script setup>
import { computed } from 'vue';
import { sb } from '../../../shared/services/sb.js';
import { sessionsStore, headerStore } from '../store.js';
import { useProjectAvatar } from '../../../shared/composables/use-avatar.js';
import { cleanName, sessionTimeStr } from '../composables/use-session-display.js';
import SessionHeader from '../components/SessionHeader.vue';

// The sessions Feature's edge Container for the terminal header: it reads the feature store and
// the avatar composable, resolves the display strings and live status the Dumb SessionHeader
// needs, and turns its `stop` back into a service call. It is the only header component that
// touches the store, the service or the frozen renderer's globals.

const session = computed(() => headerStore.headerSession);
const sessionId = computed(() => session.value?.sessionId);

const sessionName = computed(() => {
  const s = session.value;
  if (!s) return '';
  return cleanName(s.name || s.summary || 'Session');
});

const aiTitle = computed(() => {
  const s = session.value;
  if (!s?.aiTitle) return null;
  const cleaned = cleanName(s.aiTitle);
  return cleaned !== sessionName.value ? cleaned : null;
});

const timeStr = computed(() => (session.value ? sessionTimeStr(session.value) : ''));

const isRunning = computed(() => sessionsStore.activePtyIds?.has(sessionId.value));
const isBusy = computed(() => sessionsStore.sessionBusyState?.get(sessionId.value) || false);
const isAttention = computed(() => sessionsStore.attentionSessions?.has(sessionId.value));

const projectPath = computed(() => session.value?.projectPath || '');
const { dataUrl, fallback } = useProjectAvatar(projectPath);
const avatar = computed(() => ({
  dataUrl: dataUrl.value,
  alt: projectPath.value.split('/').filter(Boolean).pop() || '',
  initials: fallback.value.initials,
  color: fallback.value.color,
}));

function onStop() {
  if (sessionId.value) sb.stopSession?.(sessionId.value);
}
</script>
