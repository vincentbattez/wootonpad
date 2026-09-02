<template>
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { appIcons } from '../../../shared/lib/icons.js';
import { api } from '../../../shared/services/api.js';
import { sb } from '../../../shared/services/sb.js';
import { store } from '../../../store.js';
import { switchTab } from '../bridge.js';
import { useDebouncedSearch } from '../../../shared/composables/use-debounced-search.js';
import SbSearchField from '../../../shared/ui/SbSearchField.vue';
import NavigationTabs from '../components/NavigationTabs.vue';

// The navigation Feature's edge Container: the sidebar chrome — the tab strip, the
// collapse/settings buttons, the search field, the filter menu and the two toolbar
// actions. It owns the search, the three mutually-exclusive filters, the tab switch
// and the two creation gestures (Add project / New area), turning each into a service
// call so the shell holds none of it (VIN-124).
const { EXPAND_SVG, COLLAPSE_SVG, GEAR_SVG, RUNNING_SVG, STAR_SVG, TODAY_SVG, GRID_SVG, FILTERS_SVG, RESORT_SVG, ADD_AREA_SVG, ADD_PROJECT_SVG } = appIcons;

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

// ── Mount lifecycle ───────────────────────────────────────────────
onMounted(async () => {
  // Restore persisted settings
  const savedTitlesOnly = await api.getSetting?.('searchTitlesOnly');
  if (savedTitlesOnly) store.searchTitlesOnly = true;

  // Restore filter preferences from localStorage
  store.showRunningOnly = localStorage.getItem('showRunningOnly') === '1';
  store.showStarredOnly = localStorage.getItem('showStarredOnly') === '1';
  store.showTodayOnly = localStorage.getItem('showTodayOnly') === '1';
});
</script>
