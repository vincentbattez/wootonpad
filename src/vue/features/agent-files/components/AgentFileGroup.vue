<template>
  <!-- A titled group of file rows, shared by both panels: the Plans panel renders one fixed
       group, the Memory panel a collapsible group per Project (plus Global). A Dumb Component —
       collapse is local presentation; the avatar arrives resolved from the Container. -->
  <div class="project-group" :class="{ collapsed }">
    <div class="project-header" @click="onHeaderClick">
      <span v-if="collapsible" class="arrow">&#9660;</span>
      <SbAvatar
        v-if="avatar"
        class="project-header-avatar"
        :data-url="avatar.dataUrl"
        :alt="avatar.alt"
        :initials="avatar.initials"
        :color="avatar.color"
      />
      <span class="project-name">{{ label }}</span>
      <span v-if="showCount" class="memory-file-count">{{ files.length }}</span>
    </div>
    <div class="project-sessions">
      <AgentFileItem
        v-for="row in files"
        :key="row.key"
        :title="row.title"
        :subtitle="row.subtitle"
        :meta="row.meta"
        :active="row.active"
        :item-id="row.itemId"
        :variant="row.variant"
        :runnable="row.runnable"
        :run-state="row.runState"
        @open="$emit('open', row.key)"
        @run="$emit('run', row.key)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import SbAvatar from '../../../shared/ui/SbAvatar.vue';
import AgentFileItem from './AgentFileItem.vue';

const props = defineProps({
  label: { type: String, required: true },
  files: { type: Array, default: () => [] },
  collapsible: { type: Boolean, default: false },
  showCount: { type: Boolean, default: false },
  avatar: { type: Object, default: null },
});

defineEmits(['open', 'run']);

const collapsed = ref(false);

function onHeaderClick() {
  if (props.collapsible) collapsed.value = !collapsed.value;
}
</script>
