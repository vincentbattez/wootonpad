<template>
  <div
    class="sidebar-tree"
    :class="{ 'root-drop-target': rootHover }"
    @dragover.prevent="onRootDragOver"
    @dragleave="rootHover = false"
    @drop.prevent="onRootDrop"
  >
    <AreaContainer
      :nodes="tree"
      :worktree-map="worktreeMap"
      :filter-active="filterActive"
      v-bind="shared"
    />
    <!-- Empty space below the list: an obvious target for taking a row back out to the root. -->
    <div class="sidebar-root-drop-zone"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import { buildSidebarTree, subtreeAreaIds } from '../area-tree.mjs';
import { filterSessions } from '../session-list.mjs';
import { useDropTarget } from '../shared/composables/use-drop-target.js';
import AreaContainer from '../features/areas/containers/AreaContainer.vue';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;

const worktreeMap = computed(() => {
  const map = new Map();
  for (const p of store.projects) {
    const match = p.projectPath.match(worktreePattern);
    if (match) {
      const parent = match[1];
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent).push(p);
    }
  }
  return map;
});

const worktreeSet = computed(() => {
  const s = new Set();
  for (const p of store.projects) {
    if (worktreePattern.test(p.projectPath)) s.add(p.projectPath);
  }
  return s;
});

// Areas whose own name matches the live query. Area names live in the client (not the FTS index
// the session search hits), so the match is computed here and revealed by area-tree.mjs (VIN-80).
const matchedAreaIds = computed(() => {
  if (store.searchMatchIds === null) return [];
  const q = store.searchQuery.trim().toLowerCase();
  if (!q) return [];
  return store.areas.filter(a => (a.name || '').toLowerCase().includes(q)).map(a => a.id);
});

// Every Area id in the subtree of a name-matched Area (matched Areas included). A match reveals its
// whole subtree, so the Projects filed anywhere under it must be surfaced even when the search would
// otherwise drop them.
const revealedAreaIds = computed(() => subtreeAreaIds(store.areas, matchedAreaIds.value));

const visibleProjects = computed(() => {
  let projects = store.projects;

  if (store.searchMatchIds !== null) {
    // Search: show all projects that match by session or by project name
    const revealed = revealedAreaIds.value;
    const areaOfProject = revealed.size
      ? new Map(store.areaAssignments.map(a => [a.projectPath, a.areaId]))
      : null;
    projects = projects
      .map(p => {
        const hasMatchingSessions = p.sessions.some(s => store.searchMatchIds.has(s.sessionId));
        const projectMatched = store.searchMatchProjectPaths?.has(p.projectPath);
        // A Project filed under a name-matched Area is part of that Area's revealed subtree.
        const areaRevealed = areaOfProject ? revealed.has(areaOfProject.get(p.projectPath)) : false;
        if (!hasMatchingSessions && !projectMatched && !areaRevealed) return null;
        return {
          ...p,
          sessions: hasMatchingSessions ? p.sessions.filter(s => store.searchMatchIds.has(s.sessionId)) : [],
          _projectMatchedOnly: (projectMatched || areaRevealed) && !hasMatchingSessions,
        };
      })
      .filter(Boolean);
  } else {
    // Hide projects with no sessions surviving the active filters. Archived Sessions count:
    // a fully-archived Project stays browsable, an empty directory stays hidden (ADR 0005).
    const now = Date.now();
    projects = projects.filter(p => filterSessions(p.sessions, {
      activePtyIds: store.activePtyIds,
      showStarredOnly: store.showStarredOnly,
      showRunningOnly: store.showRunningOnly,
      showTodayOnly: store.showTodayOnly,
      now,
    }).length > 0);
  }

  return projects.filter(p => !worktreeSet.value.has(p.projectPath));
});

const filterActive = computed(() =>
  !!(store.searchMatchIds !== null || store.showStarredOnly || store.showRunningOnly || store.showTodayOnly)
);

// Grouping and ordering live in the pure module; this component only feeds it the
// projects that survived the filters, already sorted by recency upstream.
const tree = computed(() => buildSidebarTree({
  areas: store.areas,
  assignments: store.areaAssignments,
  projects: visibleProjects.value,
  filters: {
    active: filterActive.value,
    keepAreaIds: store.renamingAreaId ? [store.renamingAreaId] : [],
    matchedAreaIds: matchedAreaIds.value,
  },
}));

// Props and handlers passed through unchanged to every Project row, however deep it sits.
const shared = computed(() => ({
  ...listeners,
  activePtyIds: store.activePtyIds,
  activeSessionId: store.activeSessionId,
  sessionBusyState: store.sessionBusyState,
  attentionSessions: store.attentionSessions,
  responseReadySessions: store.responseReadySessions,
  searchMatchIds: store.searchMatchIds,
  showStarredOnly: store.showStarredOnly,
  showRunningOnly: store.showRunningOnly,
  showTodayOnly: store.showTodayOnly,
  visibleSessionCount: store.visibleSessionCount,
  sessionMaxAgeDays: store.sessionMaxAgeDays,
}));

const listeners = {
  onOpen: (session) => props.callbacks.openSession?.(session),
  onStop: (id) => props.callbacks.stopSession?.(id),
  onStar: (id) => props.callbacks.toggleStar?.(id),
  onArchive: (id) => props.callbacks.archiveSession?.(id),
  onFork: (id) => props.callbacks.forkSession?.(id),
  onJsonl: (id) => props.callbacks.showJsonl?.(id),
  onLaunchConfig: (id) => props.callbacks.launchConfig?.(id),
  onRename: (id, name) => props.callbacks.renameSession?.(id, name),
  onNewSession: (project, btn) => props.callbacks.newSession?.(project, btn),
  onSettings: (path) => props.callbacks.openSettings?.(path),
  onOpenExternalIde: (path) => props.callbacks.openExternalIde?.(path),
  onOpenProjectFolder: (path) => props.callbacks.openProjectFolder?.(path),
  onRunProject: (path) => props.callbacks.runProject?.(path),
  onArchiveSessions: (sessions) => props.callbacks.archiveSessions?.(sessions),
  onRemoveProject: (path) => props.callbacks.removeProject?.(path),
};

// The root drop zone: a drop that reaches this outer element (not caught by an Area or Project
// header) unfiles the dragged row. Header handlers stopPropagation, so only gaps land here. The
// same drop-target composable the rows use, with no draggable identity, files onto the root (null).
const { dropHover: rootHover, onDragOver: onRootDragOver, onDrop: onRootDrop } = useDropTarget();
</script>
