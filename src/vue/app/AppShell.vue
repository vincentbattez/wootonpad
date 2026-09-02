<template>
  <AppLayout :collapsed="store.sidebarCollapsed">
    <!-- ── SIDEBAR ──────────────────────────────────────────────── -->
    <template #sidebar>
      <SidebarNavContainer />

      <SessionsPage />
      <PlansPage />
      <StatsPage />
      <AgentFilesPage />
      <AccountsPage />
      <ProjectsPage />

      <!-- The Plans list and the Memory tree Teleport into their pages from this Container. -->
      <AgentFilesContainer />
    </template>

    <!-- ── MAIN ─────────────────────────────────────────────────── -->
    <template #main>
      <PlaceholderView />
      <StatsView />
      <MemoryView ref="memoryViewerRef" />
      <PlanView ref="planViewerRef" />
      <SettingsView />
      <div id="project-viewer" style="display:none;">
        <ProjectViewerView ref="projectViewerRef" :callbacks="projectViewerCallbacks" />
      </div>
      <JsonlView />
      <TerminalView />
    </template>

    <!-- ── STATUS / OVERLAYS ────────────────────────────────────── -->
    <template #status>
      <!-- Status bar and grid cards rendered via Teleport into their existing container elements -->
      <Teleport to="#status-bar">
        <StatusBarContainer />
      </Teleport>
      <Teleport to="#vue-grid-cards">
        <GridCardsContainer />
      </Teleport>

      <!-- Dialogs (overlays + popover, rendered via Teleport to body inside the component) -->
      <DialogsHost ref="dialogsRef" />
    </template>
  </AppLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { store } from '../store.js';
import { api } from '../shared/services/api.js';
import { sb } from '../shared/services/sb.js';

// ── Bridge wiring ──────────────────────────────────────────────────
// The shell Container wires every Feature Bridge to the frozen legacy renderer. Each
// Feature declares its own bridge.js; app/ only assembles them here, so no central
// module has to know a Feature by name beyond mounting it (ADR 0010). This runs during
// the shell's setup — synchronously, before public/app.js loads — exactly where the
// old central main.js installed the same surface.
import {
  createSidebarBridge,
  createGridBridge,
  createProjectsBridge,
  createJsonlViewerBridge,
} from '../bridge.js';
import { createNavigationBridge } from '../features/navigation/bridge.js';
import { createSettingsBridge } from '../features/settings/bridge.js';
import { settingsStore } from '../features/settings/store.js';
import { createAgentFilesBridge } from '../features/agent-files/bridge.js';
import { agentFilesStore } from '../features/agent-files/store.js';
import { statsStore } from '../features/stats/stats-store.js';
import { createStatsBridge } from '../features/stats/stats-bridge.js';
import { createAccountsBridge, createAccountDropdownBridge } from '../features/accounts/bridge.js';
import { accountsStore, accountDropdownStore } from '../features/accounts/store.js';
import { createStatusBarBridge } from '../features/status-bar/bridge.js';
import { statusBarStore } from '../features/status-bar/store.js';
import { gridStore } from '../stores/grid.js';
import { projectsStore } from '../stores/projects.js';
import { jsonlStore } from '../stores/jsonl.js';

// ── Layout, Pages and Views ────────────────────────────────────────
import AppLayout from './AppLayout.vue';
import DialogsHost from './DialogsHost.vue';
import SidebarNavContainer from '../features/navigation/containers/SidebarNavContainer.vue';
import AgentFilesContainer from '../features/agent-files/containers/AgentFilesContainer.vue';
import StatusBarContainer from '../features/status-bar/containers/StatusBarContainer.vue';
import GridCardsContainer from '../features/grid/containers/GridCardsContainer.vue';
import SessionsPage from '../pages/SessionsPage.vue';
import PlansPage from '../pages/PlansPage.vue';
import StatsPage from '../pages/StatsPage.vue';
import AgentFilesPage from '../pages/AgentFilesPage.vue';
import AccountsPage from '../pages/AccountsPage.vue';
import ProjectsPage from '../pages/ProjectsPage.vue';
import PlaceholderView from '../views/PlaceholderView.vue';
import StatsView from '../views/StatsView.vue';
import MemoryView from '../views/MemoryView.vue';
import PlanView from '../views/PlanView.vue';
import SettingsView from '../views/SettingsView.vue';
import JsonlView from '../views/JsonlView.vue';
import TerminalView from '../views/TerminalView.vue';
import ProjectViewerView from '../views/ProjectViewerView.vue';

// The aggregate store facade app.js mutates by field name.
window.vueStore = store;

window.vueSidebar = createSidebarBridge(store);

// The navigation Feature owns the search, filters and tab surface. app.js reaches
// its search/filter writers as window.vueSidebar.setSearch/.setFilters, so they
// are merged onto the sidebar bridge object; the tab switch is window.vueApp.
const navigationBridge = createNavigationBridge(store);
window.vueSidebar.setSearch = navigationBridge.setSearch;
window.vueSidebar.setFilters = navigationBridge.setFilters;
window.vueApp = { setTab: navigationBridge.setTab };

// The agent-files Feature owns both plan and memory panels; its Bridge composes the two
// legacy globals app.js still calls by name.
const agentFiles = createAgentFilesBridge(agentFilesStore);
window.vuePlans = agentFiles.plans;
window.vueMemory = agentFiles.memory;
window.vueAccounts = createAccountsBridge(accountsStore);
window.vueAccountDropdown = createAccountDropdownBridge(accountDropdownStore);
window.vueStatusBar = createStatusBarBridge(statusBarStore);
window.vueGrid = createGridBridge(gridStore);
window.vueProjects = createProjectsBridge(projectsStore);
window.vueJsonlViewer = createJsonlViewerBridge(jsonlStore);
window.vueSettings = createSettingsBridge(settingsStore);
window.vueStats = createStatsBridge(statsStore);

// Stubs for the panels installed below via template refs, so they exist ahead of any app.js call.
window.vuePlanViewer = {};
window.vueMemoryViewer = {};
window.vueDialogs = {};

// ── Template refs ────────────────────────────────────────────────
const projectViewerRef = ref(null);
const planViewerRef = ref(null);
const memoryViewerRef = ref(null);
const dialogsRef = ref(null);

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
