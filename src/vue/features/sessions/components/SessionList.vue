<template>
  <template v-for="s in sessions" :key="s.sessionId">
    <SessionTerminalItem
      v-if="isTerminalLike(s)"
      :session="s"
      :is-active="activeSessionId === s.sessionId"
      :is-running="activePtyIds.has(s.sessionId)"
      @open="$emit('open', s)"
      @stop="(id) => $emit('stop', id)"
      @rename="(id, name) => $emit('rename', id, name)"
    />
    <SessionItem
      v-else
      :session="s"
      :compact="compact"
      :is-active="activeSessionId === s.sessionId"
      :is-running="activePtyIds.has(s.sessionId)"
      :is-busy="sessionBusyState.get(s.sessionId) || false"
      :is-attention="attentionSessions.has(s.sessionId)"
      :is-needs-input="needsInputSessions.has(s.sessionId)"
      :is-unread="unreadSessions.has(s.sessionId)"
      @open="$emit('open', s)"
      @stop="(id) => $emit('stop', id)"
      @star="(id) => $emit('star', id)"
      @archive="(id) => $emit('archive', id)"
      @fork="(id) => $emit('fork', id)"
      @jsonl="(id) => $emit('jsonl', id)"
      @launch-config="(id) => $emit('launch-config', id)"
      @rename="(id, name) => $emit('rename', id, name)"
      @done="(id) => $emit('done', id)"
    />
  </template>
</template>

<script setup>
// Renders a run of rows. The list and the item are always two components, so a row can live in
// a sidebar group, a grid card or in isolation. It picks the row component from the entry's
// type — a Terminal is a one-line row with no Session State — reads the per-row runtime state
// out of the live PTY sets it is handed, and forwards every row event untouched; it derives
// nothing from a store and owns no data.
import SessionItem from './SessionItem.vue';
import SessionTerminalItem from './SessionTerminalItem.vue';
import { isTerminalLike } from '../session-state.mjs';

defineProps({
  sessions: { type: Array, required: true },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  needsInputSessions: { type: Set, required: true },
  unreadSessions: { type: Set, required: true },
  compact: { type: Boolean, default: false },
});

defineEmits(['open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename', 'done']);
</script>
