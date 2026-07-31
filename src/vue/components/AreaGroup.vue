<template>
  <div class="area-group">
    <div
      class="area-header"
      :class="{ collapsed: node.collapsed, 'drop-target': dropHover }"
      draggable="true"
      @click.self="toggle"
      @dragstart.stop="onDragStart"
      @dragend="onDragEnd"
      @dragover.prevent.stop="onDragOver"
      @dragleave="dropHover = false"
      @drop.prevent.stop="onDrop($event)"
    >
      <span class="arrow" @click.stop="toggle">&#9660;</span>
      <AreaAvatar class="area-header-avatar" :area-id="node.id" :name="node.name" @click.stop="toggle" />
      <input
        v-if="isRenaming"
        ref="nameInput"
        class="area-name-input"
        :value="node.name"
        @click.stop
        @keydown.enter="commit($event.target.value)"
        @keydown.esc="cancel"
        @blur="commit($event.target.value)"
      />
      <span v-else class="area-name" @click.stop="toggle">{{ node.name }}</span>
      <button v-if="!isRenaming" class="area-edit-btn" data-tooltip="Edit area"
        @click.stop="openDialog">&#9998;</button>
    </div>

    <div class="area-children">
      <template v-for="child in node.children" :key="child.type === 'area' ? 'area-' + child.id : child.projectPath">
        <AreaGroup
          v-if="child.type === 'area'"
          :node="child"
          :worktree-map="worktreeMap"
          :filter-active="filterActive"
          v-bind="$attrs"
        />
        <ProjectGroup
          v-else
          :project="child.project"
          :worktrees="worktreeMap.get(child.projectPath) || []"
          v-bind="$attrs"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { store } from '../store.js';
import { removeArea } from '../area-tree.mjs';
import { startDrag, endDrag, dropOnTarget, isDragging } from '../area-drag.js';
import { setAreaImageFromFile } from '../area-image.js';
import AreaAvatar from './AreaAvatar.vue';
import ProjectGroup from './ProjectGroup.vue';

defineOptions({ inheritAttrs: false });

// Everything else the Project rows need arrives as attrs and is passed through untouched.
const props = defineProps({
  node: { type: Object, required: true },
  worktreeMap: { type: Map, default: () => new Map() },
  filterActive: Boolean,
});

// A filter forces every Area open; a click then must not overwrite the user's arrangement.
function toggle() {
  if (props.filterActive) return;
  const area = store.areas.find(a => a.id === props.node.id);
  if (!area) return;
  const collapsed = props.node.collapsed ? 0 : 1;
  area.collapsed = collapsed;
  // Persist so a collapsed Area stays collapsed across restarts.
  window.api.setAreaCollapsed(props.node.id, collapsed).catch(() => {});
}

// Drag to re-parent this Area; drop another row here to file it into this Area (VIN-78).
// An image file dropped from the OS onto the header sets the Area's image instead (VIN-82),
// reusing the terminal's file-drop pattern (window.api.getPathForFile).
const dropHover = ref(false);
function onDragStart(ev) { startDrag('area', props.node.id, ev); }
function onDragEnd() { endDrag(); dropHover.value = false; }
function onDragOver() { dropHover.value = true; }
async function onDrop(ev) {
  dropHover.value = false;
  const file = [...(ev?.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
  if (file) { await setAreaImageFromFile(props.node.id, file); return; }
  if (!isDragging()) return;
  await dropOnTarget(props.node.id);
}

const nameInput = ref(null);
const isRenaming = computed(() => store.renamingAreaId === props.node.id);

watch(isRenaming, async (renaming) => {
  if (!renaming) return;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
}, { immediate: true });

async function commit(value) {
  if (!isRenaming.value) return;
  store.renamingAreaId = null;
  const name = (value || '').trim();
  // An empty name keeps the placeholder the Area was created with.
  if (!name || name === props.node.name) return;
  await applyRename(name);
}

function cancel() {
  store.renamingAreaId = null;
}

// The Area dialog is the durable path to rename or delete, opened from the header; inline naming
// at creation stays a shortcut. Deleting asks nothing: the contents just move up one level.
function openDialog() {
  window.vueDialogs?.openAreaDialog(
    { id: props.node.id, name: props.node.name },
    { onRename: applyRename, onDelete: applyDelete },
  );
}

async function applyRename(name) {
  const result = await window.api.renameArea(props.node.id, name).catch(() => null);
  if (result?.ok) {
    const area = store.areas.find(a => a.id === props.node.id);
    if (area) area.name = result.name;
  }
}

async function applyDelete() {
  const result = await window.api.deleteArea(props.node.id).catch(() => null);
  if (!result?.ok) return;
  // Mirror the main-process one-level promotion locally so the sidebar reflects it at once.
  const next = removeArea(store.areas, store.areaAssignments, props.node.id);
  store.areas = next.areas;
  store.areaAssignments = next.assignments;
}
</script>
