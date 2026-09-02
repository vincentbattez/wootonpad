<template>
  <SettingsPanelContainer v-if="store.settingsOpen" />
</template>

<script setup>
// The Settings main surface: assembles the settings Feature's edge Container, mounted
// only while settings is open.
import { store } from '../store.js';
import SettingsPanelContainer from '../features/settings/containers/SettingsPanelContainer.vue';
</script>
