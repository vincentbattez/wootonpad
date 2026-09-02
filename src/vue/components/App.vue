<template>
  <!-- ── SIDEBAR ────────────────────────────────────────────────── -->
  <div id="sidebar" :class="{ collapsed: store.sidebarCollapsed }">
    <button id="sidebar-expand-btn" data-tooltip="Show sidebar" @click="store.sidebarCollapsed = false" v-html="EXPAND_SVG"></button>

    <!-- The account switcher is Teleported here from the accounts Feature's Container. -->
    <div id="account-selector"></div>

    <div id="sidebar-header">
      <div id="sidebar-tabs">
        <NavigationTabs :tabs="TABS" :active-tab="store.activeTab" @select="setTab" />
        <button id="global-settings-btn" data-tooltip="Global settings" @click="onGlobalSettings" v-html="GEAR_SVG"></button>
        <button id="sidebar-collapse-btn" data-tooltip="Hide sidebar" @click="store.sidebarCollapsed = true" v-html="COLLAPSE_SVG"></button>
      </div>

    </div>

    <!-- One row: the search field, then the only two actions worth a permanent slot. -->
    <div id="sidebar-toolbar">
      <SbSearchField
        :query="store.searchQuery"
        :placeholder="searchPlaceholder"
        :titles-only="store.searchTitlesOnly"
        @update="onSearchInput"
        @clear="doClearSearch"
        @toggle-titles="toggleTitlesOnly"
      />
      <span id="loading-status" v-show="store.loadingStatus">{{ store.loadingStatus }}</span>
      <button
        v-show="store.activeTab === 'sessions'"
        id="filters-btn"
        :class="{ active: anyFilterActive }"
        data-tooltip="Filters and view"
        aria-label="Filters and view"
        @click.stop="openFilterMenu"
        v-html="FILTERS_SVG"
      ></button>
      <button v-show="store.activeTab === 'sessions'" id="add-project-btn" data-tooltip="Add project" @click="onAddProject" v-html="ADD_PROJECT_SVG"></button>
    </div>

    <!-- Teleported for the same reason as .project-menu: the sidebar scrolls and would clip it. -->
    <Teleport to="body">
      <div v-if="filterMenuOpen" class="project-menu" :style="filterMenuStyle" @click.stop>
        <button id="running-toggle" class="project-menu-item" :class="{ active: store.showRunningOnly }" @click="toggleFilter('showRunningOnly')">
          <span class="project-menu-icon" v-html="RUNNING_SVG"></span>
          <span class="project-menu-label">Running only</span>
        </button>
        <button id="star-toggle" class="project-menu-item" :class="{ active: store.showStarredOnly }" @click="toggleFilter('showStarredOnly')">
          <span class="project-menu-icon" v-html="STAR_SVG"></span>
          <span class="project-menu-label">Pinned only</span>
        </button>
        <button id="today-toggle" class="project-menu-item" :class="{ active: store.showTodayOnly }" @click="toggleFilter('showTodayOnly')">
          <span class="project-menu-icon" v-html="TODAY_SVG"></span>
          <span class="project-menu-label">Today only</span>
        </button>
        <div class="project-menu-sep"></div>
        <button id="grid-toggle-btn" class="project-menu-item" :class="{ active: store.gridViewActive }" @click="onToggleGrid(); closeFilterMenu()">
          <span class="project-menu-icon" v-html="GRID_SVG"></span>
          <span class="project-menu-label">Session overview</span>
        </button>
        <button id="resort-btn" class="project-menu-item" @click="onResort(); closeFilterMenu()">
          <span class="project-menu-icon" v-html="RESORT_SVG"></span>
          <span class="project-menu-label">Re-sort sessions</span>
        </button>
        <button id="add-area-btn" class="project-menu-item" @click="onAddArea(); closeFilterMenu()">
          <span class="project-menu-icon" v-html="ADD_AREA_SVG"></span>
          <span class="project-menu-label">New area</span>
        </button>
      </div>
    </Teleport>

    <!-- Sidebar content panels (v-show keeps DOM alive for vanilla JS queries) -->
    <div id="sidebar-content" v-show="store.activeTab === 'sessions' && !store.accountSwitching">
      <SidebarApp :callbacks="sidebarCallbacks" />
    </div>
    <div v-if="store.accountSwitching && store.activeTab === 'sessions'" id="account-switch-overlay" class="account-switch-preloader">
      <div class="acct-spinner"></div><span>Switching account…</span>
    </div>
    <!-- The Plans list and the Memory tree are Teleported into these panels from the
         agent-files Feature's Container, mounted below once both mount points exist. -->
    <div id="plans-content" v-show="store.activeTab === 'plans'"></div>
    <div id="stats-content" v-show="store.activeTab === 'stats'">
      <div class="plans-empty">Click the Stats tab to view activity heatmap.</div>
    </div>
    <div id="memory-content" v-show="store.activeTab === 'memory'"></div>
    <div id="accounts-content" v-show="store.activeTab === 'accounts'">
      <AccountsContainer />
    </div>
    <div id="projects-content" v-show="store.activeTab === 'projects'">
      <ProjectsApp :callbacks="projectsCallbacks" />
    </div>
    <AgentFilesContainer />
  </div>

  <!-- ── RESIZE HANDLE ──────────────────────────────────────────── -->
  <div id="sidebar-resize-handle"></div>

  <!-- ── MAIN AREA ──────────────────────────────────────────────── -->
  <div id="main">
    <div id="placeholder">
      <p>Select a session from the sidebar to begin.</p>
    </div>
    <div id="stats-viewer" v-show="store.showStats">
      <div id="stats-viewer-header">
        <span id="stats-viewer-title">Activity</span>
        <button
          class="stats-refresh-btn"
          :class="{ 'stats-refresh-spinning': statsRef?.isRefreshing }"
          :disabled="statsRef?.isRefreshing"
          title="Refresh stats (runs claude /stats)"
          @click="statsRef?.refreshAll()"
          v-html="STATS_REFRESH_SVG"
        ></button>
      </div>
      <StatsContainer ref="statsRef" />
    </div>
    <div id="memory-viewer" v-show="store.memoryViewerOpen">
      <ViewerContainer
        ref="memoryViewerRef"
        language="markdown"
        storage-key="markdownPreviewMode"
        :show-copy-path="true"
        :show-copy-content="true"
        :on-save="memoryOnSave"
      />
    </div>
    <div id="plan-viewer" v-show="store.planViewerOpen">
      <ViewerContainer
        ref="planViewerRef"
        language="markdown"
        storage-key="markdownPreviewMode"
        :show-copy-path="true"
        :show-copy-content="true"
        :on-save="planOnSave"
      />
    </div>
    <SettingsPanelContainer v-if="store.settingsOpen" />
    <div id="project-viewer" style="display:none;">
      <ProjectViewerView ref="projectViewerRef" :callbacks="projectViewerCallbacks" />
    </div>
    <div id="jsonl-viewer" v-show="store.showJsonl">
      <JsonlViewerContainer />
    </div>
    <div id="terminal-area">
      <div id="vue-session-header">
        <SessionHeaderContainer />
      </div>
      <!-- Legacy terminal header kept for JS references (hidden) -->
      <div id="terminal-header" style="display:none;">
        <div id="terminal-header-info">
          <span id="terminal-header-name"></span>
          <span id="terminal-header-pty-title" style="display:none;"></span>
          <span id="terminal-header-id"></span>
          <span id="terminal-header-shell" style="display:none;"></span>
          <span id="terminal-header-account" class="terminal-account-badge" style="display:none;"></span>
        </div>
        <div id="terminal-header-controls">
          <span id="terminal-header-status"></span>
          <button id="terminal-stop-btn" data-tooltip="Stop process">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>
          </button>
        </div>
      </div>
      <div id="grid-viewer" v-show="store.gridViewActive">
        <div id="grid-viewer-header">
          <span id="grid-viewer-title">Session Overview</span>
          <span id="grid-viewer-count">{{ store.gridViewerCount }}</span>
        </div>
      </div>
      <div id="terminals"></div>
    </div>
  </div>

  <!-- Status bar and grid cards rendered via Teleport into their existing container elements -->
  <Teleport to="#status-bar">
    <StatusBarContainer />
  </Teleport>
  <Teleport to="#vue-grid-cards">
    <GridCardsContainer />
  </Teleport>

  <!-- Dialogs (overlays + popover, rendered via Teleport to body inside the component) -->
  <DialogsApp ref="dialogsRef" />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { appIcons } from '../shared/lib/icons.js';
import { api } from '../shared/services/api.js';
import { sb } from '../shared/services/sb.js';
import { store } from '../store.js';
import { switchTab } from '../features/navigation/bridge.js';
import { useDebouncedSearch } from '../shared/composables/use-debounced-search.js';
import SbSearchField from '../shared/ui/SbSearchField.vue';
import NavigationTabs from '../features/navigation/components/NavigationTabs.vue';
import SidebarApp from './SidebarApp.vue';
import SessionHeaderContainer from '../features/sessions/containers/SessionHeaderContainer.vue';
import AgentFilesContainer from '../features/agent-files/containers/AgentFilesContainer.vue';
import AccountsContainer from '../features/accounts/containers/AccountsContainer.vue';
import ProjectsApp from './ProjectsApp.vue';
import StatusBarContainer from '../features/status-bar/containers/StatusBarContainer.vue';
import GridCardsContainer from '../features/grid/containers/GridCardsContainer.vue';
import SettingsPanelContainer from '../features/settings/containers/SettingsPanelContainer.vue';
import ProjectViewerView from '../views/ProjectViewerView.vue';
import StatsContainer from '../features/stats/containers/StatsContainer.vue';
import JsonlViewerContainer from '../features/jsonl/containers/JsonlViewerContainer.vue';
import ViewerContainer from '../features/viewer/containers/ViewerContainer.vue';
import DialogsApp from './DialogsApp.vue';
const { EXPAND_SVG, COLLAPSE_SVG, GEAR_SVG, STATS_REFRESH_SVG, RUNNING_SVG, STAR_SVG, TODAY_SVG, GRID_SVG, FILTERS_SVG, RESORT_SVG, ADD_AREA_SVG, ADD_PROJECT_SVG } = appIcons;

// ── Template refs ────────────────────────────────────────────────
const projectViewerRef = ref(null);
const statsRef = ref(null);
const planViewerRef = ref(null);
const memoryViewerRef = ref(null);
const dialogsRef = ref(null);

const planOnSave = (filePath, content) => api.savePlan(filePath, content);
const memoryOnSave = (filePath, content) => api.saveMemory(filePath, content);

// ── Tab config ───────────────────────────────────────────────────
const TABS = [
  { id: 'sessions', label: 'Sessions', svg: appIcons.sessionsTab },
  { id: 'plans', label: 'Plans', svg: appIcons.plansTab },
  { id: 'memory', label: 'Agent Files', svg: appIcons.memoryTab },
  { id: 'stats', label: 'Stats', svg: appIcons.statsTab },
  { id: 'projects', label: 'Projects', svg: appIcons.projectsTab },
  { id: 'accounts', label: 'Accounts', svg: appIcons.accountsTab },
];

// ── Search ───────────────────────────────────────────────────────
const searchPlaceholder = computed(() => {
  switch (store.activeTab) {
    case 'plans': return 'Search plans...';
    case 'memory': return 'Search agent files...';
    case 'projects': return 'Search projects…';
    default: return 'Search sessions...';
  }
});

// The debounced search trigger lives in a shared composable; this Container hands it
// the two service calls and keeps store.searchQuery in step with the field.
const search = useDebouncedSearch({
  onSearch: (query) => sb.search?.(query, store.searchTitlesOnly),
  onClear: () => { store.searchQuery = ''; sb.clearSearch?.(); },
});

function onSearchInput(value) {
  store.searchQuery = value;
  search.onInput(value);
}

function doClearSearch() { search.clear(); }

async function toggleTitlesOnly() {
  store.searchTitlesOnly = !store.searchTitlesOnly;
  await api.setSetting?.('searchTitlesOnly', store.searchTitlesOnly);
  // The toggle changes how a live query matches — re-run it now rather than after a debounce.
  if (store.searchQuery.trim()) search.flush(store.searchQuery);
}

// ── Tab switching ────────────────────────────────────────────────
function setTab(tabId) { switchTab(store, tabId); }

// ── Filter toggles ───────────────────────────────────────────────
const filterMenuOpen = ref(false);
const filterMenuPos = ref({ top: 0, left: 0 });
const filterMenuStyle = computed(() => ({ top: filterMenuPos.value.top + 'px', left: filterMenuPos.value.left + 'px' }));

// Folded behind one button, so the badge is the only thing left telling the user a filter is on.
const anyFilterActive = computed(() =>
  store.showRunningOnly || store.showStarredOnly || store.showTodayOnly || store.gridViewActive
);

function openFilterMenu(ev) {
  if (filterMenuOpen.value) return closeFilterMenu();
  const rect = ev.currentTarget.getBoundingClientRect();
  filterMenuPos.value = { top: rect.bottom + 4, left: Math.max(8, rect.right - 200) };
  filterMenuOpen.value = true;
  document.addEventListener('click', closeFilterMenu);
  window.addEventListener('resize', closeFilterMenu);
}

function closeFilterMenu() {
  if (!filterMenuOpen.value) return;
  filterMenuOpen.value = false;
  document.removeEventListener('click', closeFilterMenu);
  window.removeEventListener('resize', closeFilterMenu);
}

function toggleFilter(filterName) {
  store[filterName] = !store[filterName];
  // Mutual exclusion: starred and running can't both be on
  if (filterName === 'showStarredOnly' && store.showStarredOnly) store.showRunningOnly = false;
  if (filterName === 'showRunningOnly' && store.showRunningOnly) store.showStarredOnly = false;
  localStorage.setItem(filterName, store[filterName] ? '1' : '0');
  sb.onFilterChange?.({
    showStarredOnly: store.showStarredOnly,
    showRunningOnly: store.showRunningOnly,
    showTodayOnly: store.showTodayOnly,
  });
}

// ── Sidebar action callbacks ──────────────────────────────────────
function onGlobalSettings() { sb.openGlobalSettings?.(); }
function onResort() { sb.resort?.(); }
function onAddProject() { sb.addProject?.(); }

// Creation and inline naming are one gesture: the row is persisted, then focused for typing.
async function onAddArea() {
  const area = await api.createArea('New Area', null).catch(() => null);
  if (!area) return;
  store.areas = [...store.areas, area];
  store.renamingAreaId = area.id;
}

function onToggleGrid() { sb.toggleGridView?.(); }

// ── Component callbacks ───────────────────────────────────────────
const sidebarCallbacks = {
  openSession: (s) => sb.openSession?.(s),
  stopSession: (id) => sb.stopSession?.(id),
  toggleStar: (id) => sb.toggleStar?.(id),
  archiveSession: (id) => sb.archiveSession?.(id),
  forkSession: (id) => sb.forkSession?.(id),
  showJsonl: (id) => sb.showJsonl?.(id),
  launchConfig: (id) => sb.launchConfig?.(id),
  renameSession: (id, name) => sb.renameSession?.(id, name),
  newSession: (project, btn) => sb.newSession?.(project, btn),
  openSettings: (path) => sb.openSettings?.(path),
  openExternalIde: (path) => sb.openExternalIde?.(path),
  openProjectFolder: (path) => sb.openProjectFolder?.(path),
  runProject: (path) => sb.runProject?.(path),
  archiveSessions: (sessions) => sb.archiveSessions?.(sessions),
  removeProject: (path) => sb.removeProject?.(path),
};

const projectsCallbacks = {
  openProject: (p) => sb.openProject?.(p),
  newSession: (p, btn) => sb.newSession?.(p, btn),
  addProject: () => sb.addProject?.(),
  projectRemoved: () => sb.projectRemoved?.(),
};

const projectViewerCallbacks = {
  newSession: (p, btn) => sb.newSession?.(p, btn),
  onTabChange: (tab) => sb.onPvTabChange?.(tab),
  worktreeDeleted: (worktreePath) => {
    store.projects = store.projects.filter(p => p.projectPath !== worktreePath);
  },
};

// ── Mount lifecycle ───────────────────────────────────────────────
onMounted(async () => {
  // The panels below are not store-backed yet: their setters go through template refs.
  const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;
  window.vueProjectViewer = {
    open: (proj) => {
      const worktrees = store.projects
        .filter(p => { const m = p.projectPath.match(worktreePattern); return m && m[1] === proj.projectPath; })
        .map(p => ({ projectPath: p.projectPath, name: p.projectPath.match(worktreePattern)?.[2] || p.projectPath }));
      projectViewerRef.value?.open(proj, worktrees);
    },
    close: () => projectViewerRef.value?.close(),
    setTab: (tab) => projectViewerRef.value?.setTab(tab),
  };
  Object.assign(window.vueDialogs, {
    openNewSession: (...args) => dialogsRef.value?.openNewSession(...args),
    openResumeSession: (...args) => dialogsRef.value?.openResumeSession(...args),
    openAddProject: (...args) => dialogsRef.value?.openAddProject(...args),
    openPopover: (...args) => dialogsRef.value?.openPopover(...args),
    openAreaDialog: (...args) => dialogsRef.value?.openAreaDialog(...args),
  });

  Object.assign(window.vuePlanViewer, {
    open: (...args) => planViewerRef.value?.open(...args),
  });
  Object.assign(window.vueMemoryViewer, {
    open: (...args) => memoryViewerRef.value?.open(...args),
  });

  // Settings panel — exposed so app.js and vanilla JS callers can open it.
  // Hides all vanilla-managed main-area content so the xterm canvas can't
  // intercept pointer events while settings is showing.
  window.openSettingsViewer = (scope, projectPath) => {
    store.planViewerOpen = false;
    store.memoryViewerOpen = false;
    const hide = ['terminal-area', 'placeholder', 'project-viewer'];
    for (const id of hide) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    store.showStats = false;
    store.showJsonl = false;
    window.vueSettings.open(scope, projectPath);
  };

  // Prevent browser "Save Page" shortcut from interfering with in-app Cmd+S save
  document.addEventListener('keydown', (e) => {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
    if (e.key === 's' && mod && !e.shiftKey && !e.altKey) e.preventDefault();
  });
  window.closeSettingsViewer = () => {
    window.vueSettings.close();
    window._restoreAfterSettings?.();
  };

  // Restore persisted settings
  const savedTitlesOnly = await api.getSetting?.('searchTitlesOnly');
  if (savedTitlesOnly) store.searchTitlesOnly = true;

  // Restore filter preferences from localStorage
  store.showRunningOnly = localStorage.getItem('showRunningOnly') === '1';
  store.showStarredOnly = localStorage.getItem('showStarredOnly') === '1';
  store.showTodayOnly = localStorage.getItem('showTodayOnly') === '1';

  // Plans & memory viewer globals (migrated from plans-memory-view.js)
  let cachedMemoryData = { global: { files: [] }, projects: [] };
  window.cachedPlans = [];

  window.loadPlans = async () => {
    window.cachedPlans = await api.getPlans();
    window.vuePlans?.setPlans(window.cachedPlans);
  };
  window.renderPlans = (plans) => {
    window.vuePlans?.setPlans(plans || window.cachedPlans);
  };
  window.openPlan = async (plan) => {
    window.vuePlans?.setActive(plan.filename);
    const result = await api.readPlan(plan.filename);
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('terminal-area').style.display = 'none';
    document.getElementById('project-viewer').style.display = 'none';
    window.vueProjectViewer?.close();
    if (window.vueStore) {
      window.vueStore.memoryViewerOpen = false;
      window.vueStore.settingsOpen = false;
      window.vueStore.showStats = false;
      window.vueStore.showJsonl = false;
      window.vueStore.planViewerOpen = true;
    }
    window.vuePlanViewer?.open(plan.title || plan.filename, result.filePath, result.content);
  };
  window.loadMemories = async () => {
    cachedMemoryData = await api.getMemories();
    window.vueMemory?.setMemories(cachedMemoryData, null);
  };
  window.renderMemories = (filterIds) => {
    window.vueMemory?.setMemories(cachedMemoryData, filterIds || null);
  };
  window.openMemory = async (file) => {
    window.vueMemory?.setActive(file.filePath);
    const content = await api.readMemory(file.filePath);
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('terminal-area').style.display = 'none';
    document.getElementById('project-viewer').style.display = 'none';
    window.vueProjectViewer?.close();
    if (window.vueStore) {
      window.vueStore.planViewerOpen = false;
      window.vueStore.settingsOpen = false;
      window.vueStore.showStats = false;
      window.vueStore.showJsonl = false;
      window.vueStore.memoryViewerOpen = true;
    }
    window.vueMemoryViewer?.open(file.filename, file.filePath, content);
  };
  window.hideAllViewers = () => {
    if (window.vueStore) {
      window.vueStore.planViewerOpen = false;
      window.vueStore.memoryViewerOpen = false;
      window.vueStore.settingsOpen = false;
      window.vueStore.showStats = false;
      window.vueStore.showJsonl = false;
    }
    const pv = document.getElementById('project-viewer');
    if (pv) pv.style.display = 'none';
    window.vueProjectViewer?.close();
    const ta = document.getElementById('terminal-area');
    if (ta) ta.style.display = '';
  };
  window.hidePlanViewer = window.hideAllViewers;
});
</script>
