<template>
  <div :class="isWorktree ? 'worktree-group' : 'project-group'" :id="folderId">

    <WorktreeHeader
      v-if="isWorktree"
      :project="project"
      :collapsed="collapsed"
      @toggle="toggle"
      @refresh-commands="refreshCommands"
      @open-menu="openMenu"
      @new-session="(p, btn) => $emit('new-session', p, btn)"
    />
    <ProjectHeader
      v-else
      :project="project"
      :short-name="shortName"
      :collapsed="collapsed"
      :has-active-session="hasActiveSession"
      :renaming="isRenaming"
      @toggle="toggle"
      @refresh-commands="refreshCommands"
      @open-menu="openMenu"
      @new-session="(p, btn) => $emit('new-session', p, btn)"
      @rename="onRename"
      @cancel-rename="onCancelRename"
    />

    <!-- Every header action but New session lives here: the row keeps one gesture, the menu holds
         the rest. Fixed coordinates rather than an absolute child, because the sidebar scrolls and
         would clip it. Open/close/positioning come from the shared context-menu composable. -->
    <Teleport to="body">
      <div v-if="menu.open.value" class="project-menu" :style="menu.style.value" @click.stop>
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

    <!-- Sessions list, with this Project's Worktrees nested beneath it. -->
    <div :class="isWorktree ? 'worktree-sessions' : 'project-sessions'" :id="'sessions-' + folderId">
      <ProjectList
        :visible="visibleItems"
        :older="olderItems"
        :archived-visible="archivedVisible"
        :archived-older="archivedOlder"
        :active-pty-ids="activePtyIds"
        :active-session-id="activeSessionId"
        :session-busy-state="sessionBusyState"
        :attention-sessions="attentionSessions"
        :response-ready-sessions="responseReadySessions"
        :search-match-ids="searchMatchIds"
        @open="(s) => $emit('open', s)"
        @stop="(id) => $emit('stop', id)"
        @star="(id) => $emit('star', id)"
        @archive="(id) => $emit('archive', id)"
        @fork="(id) => $emit('fork', id)"
        @jsonl="(id) => $emit('jsonl', id)"
        @launch-config="(id) => $emit('launch-config', id)"
        @rename="(id, name) => $emit('rename', id, name)"
        @archive-sessions="(sessions) => $emit('archive-sessions', sessions)"
      />

      <ProjectContainer
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
import { computed, onUnmounted, ref, watch } from 'vue';
import { projectGroupIcons } from '../../../shared/lib/icons.js';
import { api } from '../../../shared/services/api.js';
import { store } from '../../../store.js';
import { isStaleProject } from '../../../project-collapse.mjs';
import { partitionSessionList } from '../../../session-list.mjs';
import { useContextMenu } from '../../../shared/composables/use-context-menu.js';
import { createProjectsBridge } from '../bridge.js';
import ProjectHeader from '../components/ProjectHeader.vue';
import WorktreeHeader from '../components/WorktreeHeader.vue';
import ProjectList from '../components/ProjectList.vue';
const { gearSvg, archiveSvg, codeSvg, playSvg, folderSvg, pencilSvg, eyeOffSvg, closeSvg } = projectGroupIcons;

// The projects Feature's edge Container: the one component that imports the service layer and reads
// the store. It renders the Dumb Project (or Worktree) header and the Dumb ProjectList, owns the
// context menu (through the shared useContextMenu composable) and the inline-rename orchestration,
// wires collapse and every menu action to the main process, and mirrors each result back through
// the Feature's Bridge. A Worktree is the same Container with `isWorktree`, so the Project row and
// its nested Worktrees share one edge. Session and project events forward straight up to the
// sidebar callbacks unchanged.
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

const bridge = createProjectsBridge(store);

const folderId = computed(() => 'project-' + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, '_'));

// A user-set label wins over the path; clearing it falls back to the last two segments.
const shortName = computed(() =>
  props.project.displayName || props.project.projectPath.split('/').filter(Boolean).slice(-2).join('/')
);

const hasActiveSession = computed(() =>
  !!props.activeSessionId && (props.project.sessions || []).some(s => s.sessionId === props.activeSessionId)
);

// --- Inline rename ------------------------------------------------------------------------------
const isRenaming = computed(() => store.renamingProjectPath === props.project.projectPath);

async function onRename(name) {
  bridge.stopRename();
  const label = name ?? '';
  if (label === shortName.value) return;
  await api.renameProject(props.project.projectPath, label).catch(() => {});
}

function onCancelRename() { bridge.stopRename(); }

// --- Collapse -----------------------------------------------------------------------------------
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
  bridge.setCollapsed(props.project.projectPath, !collapsed.value);
}

// --- Session partition (ordering and visibility live in the pure module, ADR 0005) --------------
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

// --- External IDE / Run command tooltips --------------------------------------------------------
// Cosmetic only: the tooltip word. The click always goes to the main process, which re-reads the
// setting and answers 'not-configured' if there is none. Read on hover, not on mount: the tooltip
// is only ever seen after a hover, and re-reading there keeps it honest right after the command is
// configured. A Worktree resolves its own, never its parent's (ADR 0006).
const ideCommand = ref('');
const ideTooltip = computed(() =>
  ideCommand.value ? 'Open in External IDE' : 'Configure an External IDE'
);
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

// --- Context menu ------------------------------------------------------------------------------
const menu = useContextMenu();

function openMenu(ev) {
  const wasOpen = menu.open.value;
  menu.openAt(ev);
  // A right-click opens over the cursor rather than below the row.
  if (!wasOpen && menu.open.value && ev.type === 'contextmenu') {
    menu.pos.value = { top: ev.clientY + 2, left: Math.max(8, ev.clientX) };
  }
  if (menu.open.value) refreshCommands();
}

function onKeydown(ev) { if (ev.key === 'Escape') menu.close(); }

// The composable dismisses on outside-click and resize; the scrolling sidebar and the Escape key
// close it too. Bound while open and cleared however the menu closes.
watch(() => menu.open.value, (open) => {
  if (open) {
    window.addEventListener('scroll', menu.close, true);
    document.addEventListener('keydown', onKeydown);
  } else {
    window.removeEventListener('scroll', menu.close, true);
    document.removeEventListener('keydown', onKeydown);
  }
});

onUnmounted(() => menu.close());

function runFromMenu() { menu.close(); emit('run-project', props.project.projectPath); }
function ideFromMenu() { menu.close(); emit('open-external-ide', props.project.projectPath); }
function folderFromMenu() { menu.close(); emit('open-project-folder', props.project.projectPath); }
function settingsFromMenu() { menu.close(); emit('settings', props.project.projectPath); }
function archiveAllFromMenu() { menu.close(); emit('archive-sessions', props.project.sessions.filter(s => !s.archived)); }
function hideFromMenu() { menu.close(); emit('remove-project', props.project.projectPath); }
function hideWorktreeFromMenu() { menu.close(); emit('remove-project', props.project.projectPath); }
function renameFromMenu() { menu.close(); bridge.startRename(props.project.projectPath); }
</script>
