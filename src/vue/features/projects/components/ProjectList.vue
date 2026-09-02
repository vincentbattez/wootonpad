<template>
  <template v-for="item in visible" :key="item.type === 'slug' ? 'slug-' + item.slug : item.session.sessionId">
    <SlugGroup
      v-if="item.type === 'slug'"
      :slug="item.slug"
      :sessions="item.sessions"
      :active-pty-ids="activePtyIds"
      :active-session-id="activeSessionId"
      :session-busy-state="sessionBusyState"
      :attention-sessions="attentionSessions"
      :response-ready-sessions="responseReadySessions"
      v-on="rowListeners"
      @archive-all="(sessions) => $emit('archive-sessions', sessions)"
    />
    <SessionItem
      v-else
      :session="item.session"
      :is-active="activeSessionId === item.session.sessionId"
      :is-running="activePtyIds.has(item.session.sessionId)"
      :is-busy="sessionBusyState.get(item.session.sessionId) || false"
      :is-attention="attentionSessions.has(item.session.sessionId)"
      :is-response-ready="responseReadySessions.has(item.session.sessionId)"
      @open="$emit('open', item.session)"
      v-on="itemListeners"
    />
  </template>

  <div
    v-if="older.length > 0"
    class="sessions-more-toggle"
    :class="{ expanded: showOlder }"
    @click="showOlder = !showOlder"
  >
    {{ showOlder ? '- hide older' : `+ ${older.length} older` }}
  </div>

  <template v-if="showOlder">
    <template v-for="item in older" :key="item.type === 'slug' ? 'slug-' + item.slug : item.session.sessionId">
      <SlugGroup
        v-if="item.type === 'slug'"
        :slug="item.slug"
        :sessions="item.sessions"
        :active-pty-ids="activePtyIds"
        :active-session-id="activeSessionId"
        :session-busy-state="sessionBusyState"
        :attention-sessions="attentionSessions"
        :response-ready-sessions="responseReadySessions"
        v-on="rowListeners"
        @archive-all="(sessions) => $emit('archive-sessions', sessions)"
      />
      <SessionItem
        v-else
        :session="item.session"
        :is-active="activeSessionId === item.session.sessionId"
        :is-running="activePtyIds.has(item.session.sessionId)"
        :is-busy="sessionBusyState.get(item.session.sessionId) || false"
        :is-attention="attentionSessions.has(item.session.sessionId)"
        :is-response-ready="responseReadySessions.has(item.session.sessionId)"
        @open="$emit('open', item.session)"
        v-on="itemListeners"
      />
    </template>
  </template>

  <!-- This Project's archive: revealed here and nowhere else -->
  <div
    v-if="archivedCount > 0"
    class="sessions-more-toggle sessions-archive-toggle"
    :class="{ expanded: archiveExpanded }"
    @click="archiveExpanded = !archiveExpanded"
  >
    {{ archiveExpanded ? '- hide archived' : `+ ${archivedCount} archived` }}
  </div>

  <template v-if="archiveExpanded">
    <SessionItem
      v-for="item in shownArchived"
      :key="item.session.sessionId"
      :session="item.session"
      compact
      :is-active="activeSessionId === item.session.sessionId"
      :is-running="activePtyIds.has(item.session.sessionId)"
      :is-busy="sessionBusyState.get(item.session.sessionId) || false"
      :is-attention="attentionSessions.has(item.session.sessionId)"
      :is-response-ready="responseReadySessions.has(item.session.sessionId)"
      @open="$emit('open', item.session)"
      @archive="$emit('archive', item.session.sessionId)"
      @rename="(id, name) => $emit('rename', id, name)"
    />

    <div
      v-if="archivedOlder.length > 0"
      class="sessions-more-toggle sessions-archive-older-toggle"
      :class="{ expanded: showArchivedOlder }"
      @click="showArchivedOlder = !showArchivedOlder"
    >
      {{ showArchivedOlder ? '- hide older archived' : `+ ${archivedOlder.length} older archived` }}
    </div>
  </template>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue';
import SessionItem from '../../sessions/components/SessionItem.vue';
import SlugGroup from './SlugGroup.vue';

// The list of a Project's Sessions and Slug groups: the visible run, an older toggle, and this
// Project's own archive with its own older toggle. The item (SessionItem / SlugGroup) and the list
// are separate components. A Dumb Component — the ordering and the archived split are decided
// upstream in the pure session-list module and handed in as arrays; this only holds the three
// expand flags and forwards every row event untouched.
const props = defineProps({
  visible: { type: Array, default: () => [] },
  older: { type: Array, default: () => [] },
  archivedVisible: { type: Array, default: () => [] },
  archivedOlder: { type: Array, default: () => [] },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  responseReadySessions: { type: Set, required: true },
  searchMatchIds: { type: Set, default: null },
});

const emit = defineEmits([
  'open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename', 'archive-sessions',
]);

// Every row event bar `open` forwards unchanged; grouped so the two rendered runs and the slug
// groups share one binding rather than fifteen repeated lines.
const itemListeners = {
  stop: (id) => emit('stop', id),
  star: (id) => emit('star', id),
  archive: (id) => emit('archive', id),
  fork: (id) => emit('fork', id),
  jsonl: (id) => emit('jsonl', id),
  'launch-config': (id) => emit('launch-config', id),
  rename: (id, name) => emit('rename', id, name),
};
const rowListeners = {
  open: (s) => emit('open', s),
  ...itemListeners,
};

const showOlder = ref(false);
const showArchivedOlder = ref(false);

const archivedCount = computed(() => props.archivedVisible.length + props.archivedOlder.length);

const shownArchived = computed(() =>
  showArchivedOlder.value ? [...props.archivedVisible, ...props.archivedOlder] : props.archivedVisible
);

// Local and unpersisted, so every archive is collapsed on app start. Opened on its own only
// when a Session that lives in it is the one on screen — a search hit, or the Session in the
// pane — which would otherwise be invisible. Still closable: this sets the ref, not a lock.
const archiveExpanded = ref(false);
watchEffect(() => {
  const holdsSelection = archivedCount.value > 0 && (
    !!props.searchMatchIds ||
    [...props.archivedVisible, ...props.archivedOlder].some(i => i.session.sessionId === props.activeSessionId)
  );
  if (holdsSelection) archiveExpanded.value = true;
});
</script>
