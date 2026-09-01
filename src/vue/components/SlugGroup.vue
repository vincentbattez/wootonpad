<template>
  <div class="slug-group" :class="{ collapsed: !expanded, 'has-promoted': promoted.length > 0 }" :id="groupId">
    <div class="slug-group-header" @click.self="toggle">
      <div class="slug-group-row">
        <span class="slug-group-expand" @click.stop="toggle">
          <span class="arrow">&#9654;</span>
        </span>
        <div class="slug-group-info" @click="toggle">
          <div class="slug-group-name">{{ displayName }}</div>
          <div class="slug-group-meta">
            <span class="slug-group-dot" :class="{ running: hasRunning }"></span>
            <span class="slug-group-count">{{ sessions.length }} sessions</span>
            {{ ' ' + timeStr }}
          </div>
        </div>
        <button class="slug-group-archive-btn" data-tooltip="Archive all sessions in group" @click.stop="archiveAll" v-html="archiveSvg"></button>
      </div>
    </div>

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

      <template v-if="promoted.length > 0 && rest.length > 0">
        <div class="slug-group-more" :class="{ expanded: showRest }" @click="showRest = !showRest">
          <template v-if="!showRest">+ {{ rest.length }} more</template>
        </div>
        <SessionList
          v-if="showRest"
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
      </template>

      <SessionList
        v-else
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
import { slugGroupIcons } from '../shared/lib/icons.js';
import SessionList from '../features/sessions/components/SessionList.vue';
const { archiveSvg } = slugGroupIcons;

const props = defineProps({
  slug: { type: String, required: true },
  sessions: { type: Array, required: true },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  responseReadySessions: { type: Set, required: true },
});

const emit = defineEmits(['open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename', 'archive-all']);

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

const mostRecent = computed(() =>
  props.sessions.reduce((a, b) => {
    const aTime = window.lastActivityTime?.get(a.sessionId) || new Date(a.modified);
    const bTime = window.lastActivityTime?.get(b.sessionId) || new Date(b.modified);
    return bTime > aTime ? b : a;
  })
);

const displayName = computed(() => {
  const s = mostRecent.value;
  const name = s.name || s.summary || props.slug;
  return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
});

const timeStr = computed(() => {
  const t = window.lastActivityTime?.get(mostRecent.value.sessionId) || new Date(mostRecent.value.modified);
  return window.formatDate ? window.formatDate(t) : '';
});

const hasRunning = computed(() => props.sessions.some(s => props.activePtyIds.has(s.sessionId)));

const promoted = computed(() => props.sessions.filter(s => props.activePtyIds.has(s.sessionId)));
const rest = computed(() => props.sessions.filter(s => !props.activePtyIds.has(s.sessionId)));

async function archiveAll() {
  emit('archive-all', props.sessions);
}

</script>
