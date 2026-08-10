<template>
  <div :class="isWorktree ? 'worktree-group' : 'project-group'" :id="folderId">

    <!-- Worktree header -->
    <div v-if="isWorktree" class="worktree-header" :class="{ collapsed }" :id="'ph-' + folderId" @click.self="toggle" @mouseenter="refreshCommands">
      <span class="worktree-branch-icon" v-html="branchSvg" @click.stop="toggle"></span>
      <span class="worktree-name" @click.stop="toggle">{{ worktreeName }}</span>
      <button class="worktree-hide-btn" data-tooltip="Hide worktree" @click.stop="$emit('remove-project', project.projectPath)" v-html="closeSvg"></button>
      <button class="project-run-btn worktree-run-btn" :data-tooltip="runTooltip" @click.stop="runProject" v-html="playSvg"></button>
      <button class="project-ide-btn worktree-ide-btn" :data-tooltip="ideTooltip" @click.stop="openInExternalIde" v-html="codeSvg"></button>
      <button class="project-folder-btn worktree-folder-btn" data-tooltip="Open Project Folder" @click.stop="openProjectFolder" v-html="folderSvg"></button>
      <button class="project-new-btn worktree-new-btn" data-tooltip="New session in worktree" @click.stop="$emit('new-session', project, $event.currentTarget)" v-html="plusSmSvg"></button>
    </div>

    <!-- Project header -->
    <div
      v-else
      class="project-header"
      :class="{ collapsed, 'drop-target': dropHover }"
      :id="'ph-' + folderId"
      draggable="true"
      @click.self="toggle"
      @mouseenter="refreshCommands"
      @dragstart.stop="onDragStart"
      @dragend="onDragEnd"
      @dragover.prevent.stop="onDragOver"
      @dragleave="dropHover = false"
      @drop.prevent.stop="onDrop"
    >
      <span class="arrow" @click.stop="toggle">&#9660;</span>
      <ProjectAvatar class="project-header-avatar" :project-path="project.projectPath" @click.stop="toggle" />
      <span class="project-name" @click.stop="toggle">{{ shortName }}</span>
      <button class="project-run-btn" :data-tooltip="runTooltip" @click.stop="runProject" v-html="playSvg"></button>
      <button class="project-ide-btn" :data-tooltip="ideTooltip" @click.stop="openInExternalIde" v-html="codeSvg"></button>
      <button class="project-folder-btn" data-tooltip="Open Project Folder" @click.stop="openProjectFolder" v-html="folderSvg"></button>
      <button class="project-settings-btn" data-tooltip="Project settings" @click.stop="$emit('settings', project.projectPath)" v-html="gearSvg"></button>
      <button class="project-archive-btn" data-tooltip="Archive all sessions" @click.stop="archiveAll" v-html="archiveSvg"></button>
      <button class="project-new-btn" data-tooltip="New session" @click.stop="$emit('new-session', project, $event.currentTarget)" v-html="plusSvg"></button>
    </div>

    <!-- Sessions list -->
    <div :class="isWorktree ? 'worktree-sessions' : 'project-sessions'" :id="'sessions-' + folderId">

      <template v-for="item in visibleItems" :key="item.type === 'slug' ? 'slug-' + item.slug : item.session.sessionId">
        <SlugGroup
          v-if="item.type === 'slug'"
          :slug="item.slug"
          :sessions="item.sessions"
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
          @stop="$emit('stop', item.session.sessionId)"
          @star="$emit('star', item.session.sessionId)"
          @archive="$emit('archive', item.session.sessionId)"
          @fork="$emit('fork', item.session.sessionId)"
          @jsonl="$emit('jsonl', item.session.sessionId)"
          @launch-config="$emit('launch-config', item.session.sessionId)"
          @rename="(id, name) => $emit('rename', id, name)"
        />
      </template>

      <div
        v-if="olderItems.length > 0"
        class="sessions-more-toggle"
        :class="{ expanded: showOlder }"
        @click="showOlder = !showOlder"
      >
        {{ showOlder ? '- hide older' : `+ ${olderItems.length} older` }}
      </div>

      <template v-if="showOlder">
        <template v-for="item in olderItems" :key="item.type === 'slug' ? 'slug-' + item.slug : item.session.sessionId">
          <SlugGroup
            v-if="item.type === 'slug'"
            :slug="item.slug"
            :sessions="item.sessions"
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
            @stop="$emit('stop', item.session.sessionId)"
            @star="$emit('star', item.session.sessionId)"
            @archive="$emit('archive', item.session.sessionId)"
            @fork="$emit('fork', item.session.sessionId)"
            @jsonl="$emit('jsonl', item.session.sessionId)"
            @launch-config="$emit('launch-config', item.session.sessionId)"
            @rename="(id, name) => $emit('rename', id, name)"
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

      <!-- Nested worktree sub-groups -->
      <ProjectGroup
        v-for="wt in worktrees"
        :key="wt.projectPath"
        :project="wt"
        :is-worktree="true"
        :active-pty-ids="activePtyIds"
        :active-session-id="activeSessionId"
        :session-busy-state="sessionBusyState"
        :attention-sessions="attentionSessions"
        :response-ready-sessions="responseReadySessions"
        :search-match-ids="searchMatchIds"
        :show-starred-only="showStarredOnly"
        :show-running-only="showRunningOnly"
        :show-today-only="showTodayOnly"
        :visible-session-count="visibleSessionCount"
        :session-max-age-days="sessionMaxAgeDays"
        @open="(s) => $emit('open', s)"
        @stop="(id) => $emit('stop', id)"
        @star="(id) => $emit('star', id)"
        @archive="(id) => $emit('archive', id)"
        @fork="(id) => $emit('fork', id)"
        @jsonl="(id) => $emit('jsonl', id)"
        @launch-config="(id) => $emit('launch-config', id)"
        @rename="(id, name) => $emit('rename', id, name)"
        @new-session="(p, btn) => $emit('new-session', p, btn)"
        @settings="(path) => $emit('settings', path)"
        @open-external-ide="(path) => $emit('open-external-ide', path)"
        @open-project-folder="(path) => $emit('open-project-folder', path)"
        @run-project="(path) => $emit('run-project', path)"
        @archive-sessions="(sessions) => $emit('archive-sessions', sessions)"
        @remove-project="(path) => $emit('remove-project', path)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue';
import SessionItem from './SessionItem.vue';
import SlugGroup from './SlugGroup.vue';
import ProjectAvatar from './ProjectAvatar.vue';
import { isStaleProject } from '../project-collapse.mjs';
import { partitionSessionList } from '../session-list.mjs';
import { store } from '../store.js';
import { startDrag, endDrag, dropOnTarget, isDragging } from '../area-drag.js';

const props = defineProps({
  project: { type: Object, required: true },
  isWorktree: { type: Boolean, default: false },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  responseReadySessions: { type: Set, required: true },
  searchMatchIds: { type: Set, default: null },
  showStarredOnly: Boolean,
  showRunningOnly: Boolean,
  showTodayOnly: Boolean,
  visibleSessionCount: { type: Number, default: 10 },
  sessionMaxAgeDays: { type: Number, default: 3 },
  worktrees: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename',
  'new-session', 'settings', 'open-external-ide', 'open-project-folder', 'run-project', 'archive-sessions', 'remove-project',
]);

const folderId = computed(() => 'project-' + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, '_'));

// Drag a Project into an Area; drop another row on this Project files it into the Project's own
// Area (its nearest enclosing Area), resolved in the pure module (VIN-78).
const dropHover = ref(false);
function onDragStart(ev) { startDrag('project', props.project.projectPath, ev); }
function onDragEnd() { endDrag(); dropHover.value = false; }
function onDragOver() { if (isDragging()) dropHover.value = true; }
async function onDrop() {
  dropHover.value = false;
  await dropOnTarget(props.project.projectPath);
}

const avatar = computed(() =>
  window.getProjectAvatar ? window.getProjectAvatar(props.project.projectPath) : { initials: '?', color: '#666' }
);

const shortName = computed(() =>
  props.project.projectPath.split('/').filter(Boolean).slice(-2).join('/')
);

const worktreeName = computed(() => {
  const match = props.project.projectPath.match(/\/\.claude\/worktrees\/([^/]+)\/?$/);
  return match?.[1] || props.project.projectPath.split('/').pop();
});

const filterActive = computed(() =>
  !!(props.searchMatchIds || props.showStarredOnly || props.showRunningOnly || props.showTodayOnly)
);

// Forced open by a filter, or forced shut for a project matched by name alone.
const collapseForced = computed(() => props.project._projectMatchedOnly || filterActive.value);

const collapsed = computed(() => {
  if (props.project._projectMatchedOnly) return true;
  if (filterActive.value) return false;
  // Held in the store, not a local ref: a filter can unmount this group.
  return store.collapsedProjects[props.project.projectPath]
    ?? isStaleProject(props.project, props.sessionMaxAgeDays, Date.now());
});

function toggle() {
  if (collapseForced.value) return;
  store.collapsedProjects[props.project.projectPath] = !collapsed.value;
}

const showOlder = ref(false);
const showArchivedOlder = ref(false);

// Ordering and visibility live in the pure module (ADR 0005).
const partition = computed(() => partitionSessionList({
  sessions: props.project.sessions || [],
  activePtyIds: props.activePtyIds,
  searchMatchIds: props.searchMatchIds,
  showStarredOnly: props.showStarredOnly,
  showRunningOnly: props.showRunningOnly,
  showTodayOnly: props.showTodayOnly,
  visibleSessionCount: props.visibleSessionCount,
  sessionMaxAgeDays: props.sessionMaxAgeDays,
  now: Date.now(),
}));

const visibleItems = computed(() => partition.value.visible);
const olderItems = computed(() => partition.value.older);
const archivedVisible = computed(() => partition.value.archivedVisible);
const archivedOlder = computed(() => partition.value.archivedOlder);
const archivedCount = computed(() => archivedVisible.value.length + archivedOlder.value.length);

const shownArchived = computed(() =>
  showArchivedOlder.value ? [...archivedVisible.value, ...archivedOlder.value] : archivedVisible.value
);

// Local and unpersisted, so every archive is collapsed on app start. Opened on its own only
// when a Session that lives in it is the one on screen — a search hit, or the Session in the
// pane — which would otherwise be invisible. Still closable: this sets the ref, not a lock.
const archiveExpanded = ref(false);
watchEffect(() => {
  const holdsSelection = archivedCount.value > 0 && (
    !!props.searchMatchIds ||
    [...archivedVisible.value, ...archivedOlder.value].some(i => i.session.sessionId === props.activeSessionId)
  );
  if (holdsSelection) archiveExpanded.value = true;
});

// Cosmetic only: the tooltip word. The click always goes to the main process,
// which re-reads the setting and answers 'not-configured' if there is none.
// Read on hover, not on mount: the tooltip is only ever seen after a hover, and
// re-reading there keeps it honest right after the command is configured.
const ideCommand = ref('');
const ideTooltip = computed(() =>
  ideCommand.value ? 'Open in External IDE' : 'Configure an External IDE'
);

// The Run Command itself is the tooltip: what is about to start is worth reading
// before the click. A Worktree resolves its own, never its parent's (ADR 0006).
const runCommand = ref('');
const runTooltip = computed(() =>
  runCommand.value ? 'Run Project: ' + runCommand.value : 'Configure a Run Command'
);

async function refreshCommands() {
  try {
    const effective = await window.api.getEffectiveSettings(props.project.projectPath);
    ideCommand.value = effective?.externalIdeCommand || '';
    runCommand.value = effective?.runCommand || '';
  } catch {}
}

function openInExternalIde() {
  emit('open-external-ide', props.project.projectPath);
}

function runProject() {
  emit('run-project', props.project.projectPath);
}

function openProjectFolder() {
  emit('open-project-folder', props.project.projectPath);
}

async function archiveAll() {
  emit('archive-sessions', props.project.sessions.filter(s => !s.archived));
}

// SVG icons
const gearSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const archiveSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
// Code chevrons — neutral towards whichever External IDE the user picked.
const codeSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
// A play triangle: the one gesture that starts something rather than handing it elsewhere.
const playSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const folderSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const plusSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
const plusSmSvg = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
const closeSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const branchSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg>';
</script>
