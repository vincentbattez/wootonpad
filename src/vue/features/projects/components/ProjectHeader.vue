<template>
  <div
    class="project-header"
    :class="{ collapsed, 'drop-target': dropHover, 'has-active-session': hasActiveSession }"
    :id="headerId"
    draggable="true"
    @click.self="$emit('toggle')"
    @mouseenter="$emit('refresh-commands')"
    @dragstart.stop="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent.stop="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent.stop="onDrop"
    @contextmenu.prevent.stop="$emit('open-menu', $event)"
  >
    <span class="arrow" @click.stop="$emit('toggle')" v-html="chevronSvg"></span>
    <ProjectAvatar class="project-header-avatar" :project-path="project.projectPath" @click.stop="$emit('toggle')" />
    <SbEditableLabel
      :editing="editing"
      :value="shortName"
      input-class="project-name-input"
      @submit="submit"
      @cancel="cancel"
    ><span class="project-name" @click.stop="$emit('toggle')">{{ shortName }}</span></SbEditableLabel>
    <button class="project-menu-btn" data-tooltip="More actions" @click.stop="$emit('open-menu', $event)" v-html="dotsSvg"></button>
    <button class="project-new-btn" data-tooltip="New session" @click.stop="$emit('new-session', project, $event.currentTarget)" v-html="plusSvg"></button>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { projectGroupIcons } from '../../../shared/lib/icons.js';
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { useDropTarget } from '../../../shared/composables/use-drop-target.js';
import ProjectAvatar from './ProjectAvatar.vue';
const { chevronSvg, dotsSvg, plusSvg } = projectGroupIcons;

// The Project row's header: its collapse arrow, avatar, editable name and the two header actions.
// A Dumb Component — it emits `toggle`, `new-session`, `open-menu`, `rename` and `cancel-rename`,
// reads no store or service directly, and owns the two cross-cutting concerns through the shared
// composables: inline rename through the editable-label primitive and its composable, and
// drag-and-drop filing through the one drop-target composable. The Container flips `renaming` to
// this Project's row to start an edit.
const props = defineProps({
  project: { type: Object, required: true },
  shortName: { type: String, required: true },
  collapsed: { type: Boolean, default: false },
  hasActiveSession: { type: Boolean, default: false },
  renaming: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle', 'refresh-commands', 'open-menu', 'new-session', 'rename', 'cancel-rename']);

const headerId = computed(() => 'ph-project-' + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, '_'));

const { editing, start, submit: doSubmit, cancel: doCancel } =
  useInlineRename((name) => emit('rename', name));

// The Container owns the trigger (the menu's Rename), so follow the `renaming` flag it maps from the
// store rather than a local double-click.
watch(() => props.renaming, (on) => {
  if (on && !editing.value) start(props.shortName);
  else if (!on && editing.value) editing.value = false;
}, { immediate: true });

function submit(value) { doSubmit(value); }
function cancel() { doCancel(); emit('cancel-rename'); }

// Drag a Project into an Area; drop another row on this Project files it into the Project's own Area
// (its nearest enclosing Area), resolved in the pure module (VIN-78). The one drop-target composable
// carries the same semantics the Area row and the sidebar root share.
const { dropHover, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } = useDropTarget({
  type: 'project',
  id: () => props.project.projectPath,
});
</script>
