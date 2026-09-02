<template>
  <div class="slug-group" :class="{ collapsed: !expanded, 'has-promoted': promoted.length > 0 }" :id="groupId">
    <SlugHeader
      :slug="slug"
      :sessions="sessions"
      :active-pty-ids="activePtyIds"
      @toggle="toggle"
      @archive-all="$emit('archive-all', sessions)"
    />

    <div class="slug-group-sessions">
      <SessionList
        :sessions="promoted"
        :active-pty-ids="activePtyIds"
        :active-session-id="activeSessionId"
        :session-busy-state="sessionBusyState"
        :attention-sessions="attentionSessions"
        :response-ready-sessions="responseReadySessions"
        @open="(s) => $emit('open', s)"
        @stop="(id) => $emit('stop', id)"
        @star="(id) => $emit('star', id)"
        @archive="(id) => $emit('archive', id)"
        @fork="(id) => $emit('fork', id)"
        @jsonl="(id) => $emit('jsonl', id)"
        @launch-config="(id) => $emit('launch-config', id)"
        @rename="(id, name) => $emit('rename', id, name)"
      />

      <!-- When both a promoted run and a rest exist, the rest hides behind a "+N more" toggle;
           otherwise (either side empty) it renders inline. -->
      <div
        v-if="hasMore"
        class="slug-group-more"
        :class="{ expanded: showRest }"
        @click="showRest = !showRest"
      >
        <template v-if="!showRest">+ {{ rest.length }} more</template>
      </div>

      <SessionList
        v-if="!hasMore || showRest"
        :sessions="rest"
        :active-pty-ids="activePtyIds"
        :active-session-id="activeSessionId"
        :session-busy-state="sessionBusyState"
        :attention-sessions="attentionSessions"
        :response-ready-sessions="responseReadySessions"
        @open="(s) => $emit('open', s)"
        @stop="(id) => $emit('stop', id)"
        @star="(id) => $emit('star', id)"
        @archive="(id) => $emit('archive', id)"
        @fork="(id) => $emit('fork', id)"
        @jsonl="(id) => $emit('jsonl', id)"
        @launch-config="(id) => $emit('launch-config', id)"
        @rename="(id, name) => $emit('rename', id, name)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import SessionList from '../../sessions/components/SessionList.vue';
import SlugHeader from './SlugHeader.vue';

// A collapsible group of Sessions that share a slug. The item (SlugHeader) and the list
// (SessionList) are separate components; this wrapper only holds the expand state and splits the
// Sessions into the promoted run and the rest. A Dumb Component — it reads no store and forwards
// every row event untouched.
const props = defineProps({
  slug: { type: String, required: true },
  sessions: { type: Array, required: true },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  responseReadySessions: { type: Set, required: true },
});

defineEmits(['open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename', 'archive-all']);

const groupId = computed(() => 'slug-' + props.slug.replace(/[^a-zA-Z0-9_-]/g, '_'));

// Restore expand state from sessionStorage
const storedKey = computed(() => groupId.value);
const expanded = ref((() => {
  try {
    const set = new Set(JSON.parse(sessionStorage.getItem('expandedSlugs') || '[]'));
    return set.has(storedKey.value);
  } catch { return false; }
})());
const showRest = ref(false);

function toggle() {
  expanded.value = !expanded.value;
  try {
    const set = new Set(JSON.parse(sessionStorage.getItem('expandedSlugs') || '[]'));
    if (expanded.value) set.add(storedKey.value); else set.delete(storedKey.value);
    sessionStorage.setItem('expandedSlugs', JSON.stringify([...set]));
  } catch {}
}

const promoted = computed(() => props.sessions.filter(s => props.activePtyIds.has(s.sessionId)));
const rest = computed(() => props.sessions.filter(s => !props.activePtyIds.has(s.sessionId)));

// A "+N more" toggle appears only when a promoted run and a rest coexist.
const hasMore = computed(() => promoted.value.length > 0 && rest.value.length > 0);
</script>
