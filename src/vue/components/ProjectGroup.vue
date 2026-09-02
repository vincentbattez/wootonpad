<template>
  <div :class="isWorktree ? 'worktree-group' : 'project-group'" :id="folderId">

    <!-- Worktree header -->
    <div v-if="isWorktree" class="worktree-header" :class="{ collapsed }" :id="'ph-' + folderId" @click.self="toggle" @mouseenter="refreshCommands" @contextmenu.prevent.stop="openMenu">
      <span class="worktree-branch-icon" v-html="branchSvg" @click.stop="toggle"></span>
      <span class="worktree-name" @click.stop="toggle">{{ worktreeName }}</span>
      <button class="project-menu-btn worktree-menu-btn" data-tooltip="More actions" @click.stop="openMenu" v-html="dotsSvg"></button>
      <button class="project-new-btn worktree-new-btn" data-tooltip="New session in worktree" @click.stop="$emit('new-session', project, $event.currentTarget)" v-html="plusSmSvg"></button>
    </div>

    <!-- Project header -->
    <div
      v-else
      class="project-header"
      :class="{ collapsed, 'drop-target': dropHover, 'has-active-session': hasActiveSession }"
      :id="'ph-' + folderId"
      draggable="true"
      @click.self="toggle"
      @mouseenter="refreshCommands"
      @dragstart.stop="onDragStart"
      @dragend="onDragEnd"
      @dragover.prevent.stop="onDragOver"
      @dragleave="dropHover = false"
      @drop.prevent.stop="onDrop"
      @contextmenu.prevent.stop="openMenu"
    >
      <span class="arrow" @click.stop="toggle" v-html="chevronSvg"></span>
      <ProjectAvatar class="project-header-avatar" :project-path="project.projectPath" @click.stop="toggle" />
      <input
        v-if="isRenaming"
        ref="nameInput"
        class="project-name-input"
        :value="shortName"
        @click.stop
        @keydown.enter="commitRename($event.target.value)"
        @keydown.esc="cancelRename"
        @blur="commitRename($event.target.value)"
      />
      <span v-else class="project-name" @click.stop="toggle">{{ shortName }}</span>
      <button class="project-menu-btn" data-tooltip="More actions" @click.stop="openMenu" v-html="dotsSvg"></button>
      <button class="project-new-btn" data-tooltip="New session" @click.stop="$emit('new-session', project, $event.currentTarget)" v-html="plusSvg"></button>
    </div>

    <!-- Every header action but New session lives here: the row keeps one gesture, the menu holds the rest. -->
    <Teleport to="body">
      <div v-if="menuOpen" class="project-menu" :style="menuStyle" @click.stop>
        <button class="project-menu-item project-run-btn" :title="runTooltip" @click="runFromMenu">
          <span class="project-menu-icon" v-html="playSvg"></span>
          <span class="project-menu-label">Run Project</span>
        </button>
        <button class="project-menu-item project-ide-btn" :title="ideTooltip" @click="ideFromMenu">
          <span class="project-menu-icon" v-html="codeSvg"></span>
          <span class="project-menu-label">Open in External IDE</span>
        </button>
        <button class="project-menu-item project-folder-btn" @click="folderFromMenu">
          <span class="project-menu-icon" v-html="folderSvg"></span>
          <span class="project-menu-label">Open Project Folder</span>
        </button>
        <template v-if="!isWorktree">
          <button class="project-menu-item project-rename-btn" @click="renameFromMenu">
            <span class="project-menu-icon" v-html="pencilSvg"></span>
            <span class="project-menu-label">Rename</span>
          </button>
          <button class="project-menu-item project-settings-btn" @click="settingsFromMenu">
            <span class="project-menu-icon" v-html="gearSvg"></span>
            <span class="project-menu-label">Project settings</span>
          </button>
          <button class="project-menu-item project-archive-btn" @click="archiveAllFromMenu">
            <span class="project-menu-icon" v-html="archiveSvg"></span>
            <span class="project-menu-label">Archive all sessions</span>
          </button>
          <button class="project-menu-item project-menu-item-danger project-hide-btn" @click="hideFromMenu">
            <span class="project-menu-icon" v-html="eyeOffSvg"></span>
            <span class="project-menu-label">Hide project</span>
          </button>
        </template>
        <button v-else class="project-menu-item project-menu-item-danger worktree-hide-btn" @click="hideWorktreeFromMenu">
          <span class="project-menu-icon" v-html="closeSvg"></span>
          <span class="project-menu-label">Hide worktree</span>
        </button>
      </div>
    </Teleport>

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
import { computed, nextTick, ref, watch, watchEffect, onUnmounted } from 'vue';
import { projectGroupIcons } from '../shared/lib/icons.js';
import { api } from '../shared/services/api.js';
import SessionItem from '../features/sessions/components/SessionItem.vue';
import SlugGroup from './SlugGroup.vue';
import ProjectAvatar from './ProjectAvatar.vue';
import { isStaleProject } from '../project-collapse.mjs';
import { partitionSessionList } from '../session-list.mjs';
import { store } from '../store.js';
import { useDropTarget } from '../shared/composables/use-drop-target.js';
const { gearSvg, archiveSvg, codeSvg, playSvg, folderSvg, plusSvg, plusSmSvg, pencilSvg, eyeOffSvg, chevronSvg, dotsSvg, closeSvg, branchSvg } = projectGroupIcons;

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
// Area (its nearest enclosing Area), resolved in the pure module (VIN-78). The one drop-target
// composable carries the same semantics the Area row and the sidebar root share.
const { dropHover, onDragStart, onDragEnd, onDragOver, onDrop } = useDropTarget({
  type: 'project',
  id: () => props.project.projectPath,
});

const avatar = computed(() =>
  window.getProjectAvatar ? window.getProjectAvatar(props.project.projectPath) : { initials: '?', color: '#666' }
);

// A user-set label wins over the path; clearing it falls back to the last two segments.
const shortName = computed(() =>
  props.project.displayName || props.project.projectPath.split('/').filter(Boolean).slice(-2).join('/')
);

const nameInput = ref(null);
const isRenaming = computed(() => store.renamingProjectPath === props.project.projectPath);

watch(isRenaming, async (renaming) => {
  if (!renaming) return;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
});

async function commitRename(value) {
  if (!isRenaming.value) return;
  store.renamingProjectPath = null;
  const name = (value || '').trim();
  if (name === shortName.value) return;
  await api.renameProject(props.project.projectPath, name).catch(() => {});
}

function cancelRename() {
  store.renamingProjectPath = null;
}

const hasActiveSession = computed(() =>
  !!props.activeSessionId && (props.project.sessions || []).some(s => s.sessionId === props.activeSessionId)
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
    const effective = await api.getEffectiveSettings(props.project.projectPath);
    ideCommand.value = effective?.externalIdeCommand || '';
    runCommand.value = effective?.runCommand || '';
  } catch {}
}

// The header keeps one gesture (New session); everything else opens from here. Fixed
// coordinates rather than an absolute child: the sidebar scrolls and would clip it.
const menuOpen = ref(false);
const menuPos = ref({ top: 0, left: 0 });
const menuStyle = computed(() => ({ top: menuPos.value.top + 'px', left: menuPos.value.left + 'px' }));

function openMenu(ev) {
  if (menuOpen.value) return closeMenu();
  if (ev.type === 'contextmenu') {
    menuPos.value = { top: ev.clientY + 2, left: Math.max(8, ev.clientX) };
  } else {
    const rect = ev.currentTarget.getBoundingClientRect();
    menuPos.value = { top: rect.bottom + 4, left: Math.max(8, rect.right - 200) };
  }
  menuOpen.value = true;
  refreshCommands();
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', onMenuKeydown);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
}

function closeMenu() {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  document.removeEventListener('click', closeMenu);
  document.removeEventListener('keydown', onMenuKeydown);
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('resize', closeMenu);
}

function onMenuKeydown(ev) {
  if (ev.key === 'Escape') closeMenu();
}

onUnmounted(closeMenu);

function runFromMenu() { closeMenu(); runProject(); }
function ideFromMenu() { closeMenu(); openInExternalIde(); }
function folderFromMenu() { closeMenu(); openProjectFolder(); }
function settingsFromMenu() { closeMenu(); emit('settings', props.project.projectPath); }
function archiveAllFromMenu() { closeMenu(); archiveAll(); }
function hideWorktreeFromMenu() { closeMenu(); emit('remove-project', props.project.projectPath); }
function renameFromMenu() { closeMenu(); store.renamingProjectPath = props.project.projectPath; }
function hideFromMenu() { closeMenu(); emit('remove-project', props.project.projectPath); }

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
// Code chevrons — neutral towards whichever External IDE the user picked.
// A play triangle: the one gesture that starts something rather than handing it elsewhere.
</script>
