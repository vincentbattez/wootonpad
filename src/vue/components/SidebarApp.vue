<template>
  <div
    class="sidebar-tree"
    :class="{ 'root-drop-target': rootHover }"
    @dragover.prevent="onRootDragOver"
    @dragleave="rootHover = false"
    @drop.prevent="onRootDrop"
  >
    <template v-for="node in tree" :key="node.type === 'area' ? 'area-' + node.id : node.projectPath">
      <AreaGroup
        v-if="node.type === 'area'"
        :node="node"
        :worktree-map="worktreeMap"
        :filter-active="filterActive"
        v-bind="shared"
      />
      <ProjectGroup
        v-else
        :project="node.project"
        :worktrees="worktreeMap.get(node.projectPath) || []"
        v-bind="shared"
      />
    </template>
    <!-- Empty space below the list: an obvious target for taking a row back out to the root. -->
    <div class="sidebar-root-drop-zone"></div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { store } from '../store.js';
import { buildSidebarTree } from '../area-tree.mjs';
import { dropOnTarget, isDragging } from '../area-drag.js';
import ProjectGroup from './ProjectGroup.vue';
import AreaGroup from './AreaGroup.vue';

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

const visibleProjects = computed(() => {
  let projects = store.projects;

  if (store.searchMatchIds !== null) {
    // Search: show all projects that match by session or by project name
    projects = projects
      .map(p => {
        const hasMatchingSessions = p.sessions.some(s => store.searchMatchIds.has(s.sessionId));
        const projectMatched = store.searchMatchProjectPaths?.has(p.projectPath);
        if (!hasMatchingSessions && !projectMatched) return null;
        return {
          ...p,
          sessions: hasMatchingSessions ? p.sessions.filter(s => store.searchMatchIds.has(s.sessionId)) : [],
          _projectMatchedOnly: projectMatched && !hasMatchingSessions,
        };
      })
      .filter(Boolean);
  } else {
    // Hide projects with no sessions surviving the active filters
    projects = projects.filter(p => {
      let sessions = store.showArchived ? p.sessions : p.sessions.filter(s => !s.archived);
      if (store.showStarredOnly) sessions = sessions.filter(s => s.starred);
      if (store.showRunningOnly) sessions = sessions.filter(s => store.activePtyIds.has(s.sessionId));
      if (store.showTodayOnly) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        sessions = sessions.filter(s => {
          if (!s.modified) return false;
          const d = new Date(s.modified);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
        });
      }
      return sessions.length > 0;
    });
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
  showArchived: store.showArchived,
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
  onArchiveSessions: (sessions) => props.callbacks.archiveSessions?.(sessions),
  onRemoveProject: (path) => props.callbacks.removeProject?.(path),
};

// The root drop zone: a drop that reaches this outer element (not caught by an Area or Project
// header) unfiles the dragged row. Header handlers stopPropagation, so only gaps land here.
const rootHover = ref(false);
function onRootDragOver() { if (isDragging()) rootHover.value = true; }
async function onRootDrop() {
  rootHover.value = false;
  await dropOnTarget(null);
}

onMounted(async () => {
  const data = await window.api.getAreas?.().catch(() => null);
  if (!data) return;
  // An Area created while this load was in flight must survive the response.
  const fetched = data.areas || [];
  const fetchedIds = new Set(fetched.map(a => a.id));
  store.areas = [...fetched, ...store.areas.filter(a => !fetchedIds.has(a.id))];
  store.areaAssignments = data.assignments || [];
});
</script>
