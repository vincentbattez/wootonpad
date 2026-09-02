<template>
  <div id="projects-content" v-show="store.activeTab === 'projects'">
    <ProjectsPanelContainer />
  </div>
</template>

<script setup>
// The Projects tab: assembles the projects Feature's panel Container and nothing else.
import { store } from '../store.js';
import ProjectsPanelContainer from '../features/projects/containers/ProjectsPanelContainer.vue';
</script>
