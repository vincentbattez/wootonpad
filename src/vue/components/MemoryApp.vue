<template>
  <div>
    <div v-if="allFiles.length === 0" class="plans-empty">
      No memory files found.
    </div>

    <template v-else>
      <MemoryGroup
        v-if="data.global.files.length > 0"
        group-key="__global__"
        label="Global"
        :files="filteredGlobal"
        :active-file="activeFile"
        @open="openMemory"
      />
      <MemoryGroup
        v-for="proj in filteredProjects"
        :key="proj.folder"
        :group-key="proj.folder"
        :label="proj.shortName"
        :files="proj.files"
        :active-file="activeFile"
        :project-path="proj.projectPath"
        @open="openMemory"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import MemoryGroup from './MemoryGroup.vue';
import { memoryStore } from '../stores/memory.js';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

// Read the feature store the memory bridge writes.
const data = computed(() => memoryStore.data);
const filterIds = computed(() => memoryStore.filterIds);
const activeFile = computed(() => memoryStore.activeFile);

const allFiles = computed(() =>
  [...data.value.global.files, ...data.value.projects.flatMap(p => p.files)]
);

const filteredGlobal = computed(() => {
  if (!filterIds.value) return data.value.global.files;
  return data.value.global.files.filter(f => filterIds.value.has(f.filePath));
});

const filteredProjects = computed(() => {
  return data.value.projects
    .map(proj => ({
      ...proj,
      files: filterIds.value ? proj.files.filter(f => filterIds.value.has(f.filePath)) : proj.files,
    }))
    .filter(proj => proj.files.length > 0);
});

function openMemory(file) {
  memoryStore.activeFile = file.filePath;
  props.callbacks.openMemory?.(file);
}
</script>
