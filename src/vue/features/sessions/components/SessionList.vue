<template>
  <SessionItem
    v-for="s in sessions"
    :key="s.sessionId"
    :session="s"
    :compact="compact"
    :is-active="activeSessionId === s.sessionId"
    :is-running="activePtyIds.has(s.sessionId)"
    :is-busy="sessionBusyState.get(s.sessionId) || false"
    :is-attention="attentionSessions.has(s.sessionId)"
    :is-response-ready="responseReadySessions.has(s.sessionId)"
    @open="$emit('open', s)"
    @stop="(id) => $emit('stop', id)"
    @star="(id) => $emit('star', id)"
    @archive="(id) => $emit('archive', id)"
    @fork="(id) => $emit('fork', id)"
    @jsonl="(id) => $emit('jsonl', id)"
    @launch-config="(id) => $emit('launch-config', id)"
    @rename="(id, name) => $emit('rename', id, name)"
  />
</template>

<script setup>
// Renders a run of Session rows. The list and the item are always two components, so a Session
// row can live in a sidebar group, a grid card or in isolation. It reads the per-row runtime
// state out of the live PTY sets it is handed and forwards every row event untouched; it
// derives nothing from a store and owns no data.
import SessionItem from './SessionItem.vue';

defineProps({
  sessions: { type: Array, required: true },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  responseReadySessions: { type: Set, required: true },
  compact: { type: Boolean, default: false },
});

defineEmits(['open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename']);
</script>
