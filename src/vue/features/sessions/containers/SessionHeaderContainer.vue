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
    :context-usage="contextUsage"
    :context-model="contextModel"
    @stop="onStop"
  />
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { sb } from '../../../shared/services/sb.js';
import { sessionsStore, headerStore } from '../store.js';
import { useProjectAvatar } from '../../../shared/composables/use-avatar.js';
import { cleanDisplayName, sessionTimeStr } from '../composables/use-session-display.js';
import { subscribeSessionContext } from '../context-service.js';
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
  return cleanDisplayName(s.name || s.summary || 'Session');
});

const aiTitle = computed(() => {
  const s = session.value;
  if (!s?.aiTitle) return null;
  const cleaned = cleanDisplayName(s.aiTitle);
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

// The gauge value: the live push wins while it is for the Session on screen (it lands within
// a second of a turn ending), otherwise the Session's resting value carried on its row. Both
// are a { usage breakdown, model } pair, so the Session on screen never shows a stale number
// nor a number belonging to another Session.
const liveContext = computed(() => {
  const c = headerStore.headerContext;
  return c && c.sessionId === sessionId.value ? c : null;
});
const contextUsage = computed(() => liveContext.value?.usage ?? session.value?.contextUsage ?? null);
const contextModel = computed(() => liveContext.value?.model ?? session.value?.contextModel ?? null);

onMounted(subscribeSessionContext);

function onStop() {
  if (sessionId.value) sb.stopSession?.(sessionId.value);
}
</script>
