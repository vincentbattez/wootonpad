<template>
  <div class="area-group">
    <div class="area-header" :class="{ collapsed: node.collapsed }" @click.self="toggle">
      <span class="arrow" @click.stop="toggle">&#9660;</span>
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
  const result = await window.api.renameArea(props.node.id, name).catch(() => null);
  if (result?.ok) {
    const area = store.areas.find(a => a.id === props.node.id);
    if (area) area.name = result.name;
  }
}

function cancel() {
  store.renamingAreaId = null;
}
</script>
