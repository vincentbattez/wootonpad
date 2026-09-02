<template>
  <template v-for="node in nodes" :key="node.type === 'area' ? 'area-' + node.id : node.projectPath">
    <AreaItem
      v-if="node.type === 'area'"
      :node="node"
      :handlers="handlers"
      :renaming-id="renamingId"
    >
      <AreaList
        :nodes="node.children"
        :worktree-map="worktreeMap"
        :handlers="handlers"
        :renaming-id="renamingId"
        v-bind="$attrs"
      />
    </AreaItem>
    <ProjectContainer
      v-else
      :project="node.project"
      :worktrees="worktreeMap.get(node.projectPath) || []"
      v-bind="$attrs"
    />
  </template>
</template>

<script setup>
import AreaItem from './AreaItem.vue';
import ProjectContainer from '../../projects/containers/ProjectContainer.vue';

// The ordered list of Area rows and the Project rows filed at that level: Areas render as an
// AreaItem whose slot is this same list one level down, Projects as a ProjectContainer (the
// projects Feature's edge). A Dumb Component — the Area handlers arrive as a bundle and the Project
// row's props and listeners ride through on `$attrs`, both passed straight through however deep the
// tree goes.
defineOptions({ inheritAttrs: false });

defineProps({
  nodes: { type: Array, default: () => [] },
  worktreeMap: { type: Map, default: () => new Map() },
  handlers: { type: Object, required: true },
  renamingId: { type: String, default: null },
});
</script>
