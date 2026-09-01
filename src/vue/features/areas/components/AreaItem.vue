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
      @dragleave="onDragLeave"
      @drop.prevent.stop="onDrop($event)"
      @contextmenu.prevent.stop="handlers.onContextMenu($event, node)"
    >
      <span class="arrow" @click.stop="toggle" v-html="chevronSvg"></span>
      <AreaAvatar class="area-header-avatar" :area-id="node.id" :name="node.name" @click.stop="toggle" />
      <SbEditableLabel
        :editing="renaming"
        :value="renameValue"
        input-class="area-name-input"
        @submit="submit"
        @cancel="cancel"
      ><span class="area-name" @click.stop="toggle">{{ node.name }}</span></SbEditableLabel>
      <button v-if="!renaming" class="area-edit-btn" data-tooltip="Edit area"
        @click.stop="handlers.onEdit(node)">&#9998;</button>
    </div>

    <div class="area-children"><slot /></div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { areaGroupIcons } from '../../../shared/lib/icons.js';
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { useDropTarget } from '../../../shared/composables/use-drop-target.js';
import AreaAvatar from './AreaAvatar.vue';
const { chevronSvg } = areaGroupIcons;

// The Area row: its header (avatar, editable name, edit button) plus a slot for its filed rows.
// A Dumb Component — it emits nothing to the outside except through the `handlers` bundle the
// Container hands down, and reads no store or service directly. The two cross-cutting concerns it
// owns are shared: inline rename through the editable-label primitive and its composable, and
// drag-and-drop through the one drop-target composable. Its inline-rename state is kicked off by
// the Container flipping `renamingId` to this Area's id.
const props = defineProps({
  node: { type: Object, required: true },
  handlers: { type: Object, required: true },
  renamingId: { type: String, default: null },
});

const renaming = computed(() => props.node.id === props.renamingId);

const { editing, draft: renameValue, start, submit: doSubmit, cancel: doCancel } =
  useInlineRename((name) => props.handlers.onRename(props.node.id, name));

// The Container owns the trigger (a fresh Area, or the menu's Rename), so follow the store flag
// it maps into `renamingId` rather than a local double-click.
watch(renaming, (on) => {
  if (on && !editing.value) start(props.node.name);
  else if (!on && editing.value) editing.value = false;
}, { immediate: true });

function submit(value) { doSubmit(value); }
function cancel() { doCancel(); props.handlers.onCancelRename(props.node.id); }

function toggle() { props.handlers.onToggle(props.node); }

const { dropHover, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } = useDropTarget({
  type: 'area',
  id: () => props.node.id,
  // The Area row lights up for anything hovered, including an OS image file dropped onto it.
  guardHover: false,
  onFileDrop: (file) => props.handlers.onImageDrop(props.node.id, file),
});
</script>
