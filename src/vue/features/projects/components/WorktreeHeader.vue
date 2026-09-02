<template>
  <div class="worktree-header" :class="{ collapsed }" :id="headerId" @click.self="$emit('toggle')" @mouseenter="$emit('refresh-commands')" @contextmenu.prevent.stop="$emit('open-menu', $event)">
    <span class="worktree-branch-icon" v-html="branchSvg" @click.stop="$emit('toggle')"></span>
    <span class="worktree-name" @click.stop="$emit('toggle')">{{ worktreeName }}</span>
    <button class="project-menu-btn worktree-menu-btn" data-tooltip="More actions" @click.stop="$emit('open-menu', $event)" v-html="dotsSvg"></button>
    <button class="project-new-btn worktree-new-btn" data-tooltip="New session in worktree" @click.stop="$emit('new-session', project, $event.currentTarget)" v-html="plusSmSvg"></button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { projectGroupIcons } from '../../../shared/lib/icons.js';
const { dotsSvg, plusSmSvg, branchSvg } = projectGroupIcons;

// A Worktree's header row: its branch icon, name and the two actions. Rendered as its own item,
// distinct from the Project header — a Worktree has no avatar, no inline rename and is not a
// drop target. A Dumb Component: it emits `toggle`, `refresh-commands`, `open-menu` and
// `new-session` and reads nothing from the outside.
const props = defineProps({
  project: { type: Object, required: true },
  collapsed: { type: Boolean, default: false },
});

defineEmits(['toggle', 'refresh-commands', 'open-menu', 'new-session']);

const headerId = computed(() => 'ph-project-' + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, '_'));

const worktreeName = computed(() => {
  const match = props.project.projectPath.match(/\/\.claude\/worktrees\/([^/]+)\/?$/);
  return match?.[1] || props.project.projectPath.split('/').pop();
});
</script>
