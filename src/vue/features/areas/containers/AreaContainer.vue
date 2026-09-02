<template>
  <AreaList
    :nodes="nodes"
    :worktree-map="worktreeMap"
    :handlers="handlers"
    :renaming-id="store.renamingAreaId"
    v-bind="$attrs"
  />

  <!-- Right-click shortcut to what the Area dialog already does; fixed coordinates because the
       sidebar scrolls. Only one row's menu is ever open, so the Container owns the single panel. -->
  <Teleport to="body">
    <div v-if="menuOpen" class="project-menu" :style="menuStyle" @click.stop>
      <button class="project-menu-item area-rename-btn" @click="renameFromMenu">
        <span class="project-menu-icon" v-html="pencilSvg"></span>
        <span class="project-menu-label">Rename</span>
      </button>
      <button class="project-menu-item project-menu-item-danger area-delete-btn" @click="deleteFromMenu">
        <span class="project-menu-icon" v-html="trashSvg"></span>
        <span class="project-menu-label">Delete area</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { areaGroupIcons } from '../../../shared/lib/icons.js';
import { api } from '../../../shared/services/api.js';
import { store } from '../../../store.js';
import { removeArea } from '../../../area-tree.mjs';
import { openAreaDialog } from '../../../dialogs/dialog-store.js';
import { createAreasBridge } from '../bridge.js';
import { setAreaImageFromFile } from '../area-image.js';
import AreaList from '../components/AreaList.vue';
const { pencilSvg, trashSvg } = areaGroupIcons;

// The areas Feature's edge Container: the one component that imports the service layer and reads
// the store. It fetches the Area tree, wires every Area row's behaviour — toggle, rename, delete,
// the context menu and the OS image drop — to the main process, and mirrors each result back
// through the Feature's Bridge. The Dumb AreaList/AreaItem below only render and emit through the
// handler bundle. The Project row's props and listeners ride through on `$attrs`.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  worktreeMap: { type: Map, default: () => new Map() },
  filterActive: Boolean,
});

const bridge = createAreasBridge(store);

// A filter forces every Area open; a click then must not overwrite the user's arrangement.
function onToggle(node) {
  if (props.filterActive) return;
  if (!store.areas.some(a => a.id === node.id)) return;
  const collapsed = node.collapsed ? 0 : 1;
  bridge.setCollapsed(node.id, collapsed);
  // Persist so a collapsed Area stays collapsed across restarts.
  api.setAreaCollapsed(node.id, collapsed).catch(() => {});
}

// The Area dialog is the durable path to rename or delete, opened from the header; inline naming
// at creation stays a shortcut. Deleting asks nothing: the contents just move up one level.
function onEdit(node) {
  openAreaDialog(
    { id: node.id, name: node.name },
    { onRename: (name) => applyRename(node.id, name), onDelete: () => applyDelete(node.id) },
  );
}

async function onRename(id, name) {
  bridge.stopRename();
  const area = store.areas.find(a => a.id === id);
  // A free-form, non-unique name; an empty or unchanged name is a no-op, not a rejection.
  if (!name || !area || name === area.name) return;
  await applyRename(id, name);
}

function onCancelRename() { bridge.stopRename(); }

function onImageDrop(id, file) { return setAreaImageFromFile(id, file); }

async function applyRename(id, name) {
  const result = await api.renameArea(id, name).catch(() => null);
  if (result?.ok) bridge.renameArea(id, result.name);
}

async function applyDelete(id) {
  const result = await api.deleteArea(id).catch(() => null);
  if (!result?.ok) return;
  // Mirror the main-process one-level promotion locally so the sidebar reflects it at once.
  const next = removeArea(store.areas, store.areaAssignments, id);
  bridge.setTree(next.areas, next.assignments);
}

// The context menu: fixed coordinates rather than an absolute child, because the sidebar scrolls
// and would clip it. Opened over whichever Area was right-clicked.
const menuOpen = ref(false);
const menuArea = ref(null);
const menuPos = ref({ top: 0, left: 0 });
const menuStyle = computed(() => ({ top: menuPos.value.top + 'px', left: menuPos.value.left + 'px' }));

function onContextMenu(ev, node) {
  if (menuOpen.value) return closeMenu();
  menuArea.value = node;
  menuPos.value = { top: ev.clientY + 2, left: Math.max(8, ev.clientX) };
  menuOpen.value = true;
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

function renameFromMenu() { const node = menuArea.value; closeMenu(); if (node) bridge.startRename(node.id); }
function deleteFromMenu() { const node = menuArea.value; closeMenu(); if (node) applyDelete(node.id); }

const handlers = { onToggle, onContextMenu, onEdit, onRename, onCancelRename, onImageDrop };

onMounted(async () => {
  const data = await api.getAreas?.().catch(() => null);
  if (!data) return;
  bridge.mergeAreas(data.areas || []);
  bridge.setAssignments(data.assignments || []);
});
</script>
