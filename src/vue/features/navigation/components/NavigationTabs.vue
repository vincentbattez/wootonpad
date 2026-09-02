<template>
  <!-- The sidebar tab strip: one segmented control over the tabs. Dumb — it takes the
       tabs and the active one, and emits the tab the user picked. The parent renders it
       inside #sidebar-tabs, next to the settings and collapse buttons. -->
  <SbSegmentedControl
    :segments="segments"
    :model-value="activeTab"
    item-class="sidebar-tab"
    @update:model-value="$emit('select', $event)"
  />
</template>

<script setup>
import { computed } from 'vue';
import SbSegmentedControl from '../../../shared/ui/SbSegmentedControl.vue';

const props = defineProps({
  tabs: { type: Array, required: true },   // [{ id, label, svg }]
  activeTab: { type: String, required: true },
});
defineEmits(['select']);

const segments = computed(() => props.tabs.map((tab) => ({
  value: tab.id,
  html: tab.svg,
  attrs: { 'data-tab': tab.id, 'data-tooltip': tab.label },
})));
</script>
