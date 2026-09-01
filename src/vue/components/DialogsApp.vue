<template>
  <!-- Each dialog is its own file reading its slice from the shared dialog store; this host only
       mounts them and re-exposes the open() calls the bridge (window.vueDialogs) still invokes. -->
  <NewSessionPopover />
  <NewSessionDialog />
  <ResumeSessionDialog />
  <AreaDialog />
  <AddProjectDialog />
</template>

<script setup>
import NewSessionPopover from '../dialogs/NewSessionPopover.vue';
import NewSessionDialog from '../dialogs/NewSessionDialog.vue';
import ResumeSessionDialog from '../dialogs/ResumeSessionDialog.vue';
import AreaDialog from '../dialogs/AreaDialog.vue';
import AddProjectDialog from '../dialogs/AddProjectDialog.vue';
import {
  openNewSession, openResumeSession, openAddProject, openPopover, openAreaDialog,
} from '../dialogs/dialog-store.js';

defineExpose({ openNewSession, openResumeSession, openAddProject, openPopover, openAreaDialog });
</script>
