<template>
  <SbDialog :open="open" overlay-class="add-project-overlay" dialog-class="add-project-dialog" @close="close">
    <h3>Add Project</h3>
    <div class="add-project-hint">Select a folder to create a new project. To start a session in an existing project, use the + on its project header.</div>
    <div class="folder-input-row">
      <input ref="pathInputRef" type="text" id="add-project-path" v-model="path"
        placeholder="/path/to/project" autocomplete="off" spellcheck="false">
      <button class="add-project-browse-btn" @click="browse">Browse</button>
    </div>
    <div class="add-project-error" v-show="error">{{ error }}</div>
    <div class="add-project-actions">
      <button class="add-project-cancel-btn" @click="close">Cancel</button>
      <button class="add-project-add-btn" @click="add">Add</button>
    </div>
  </SbDialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { api } from '../../../shared/services/api.js';
import SbDialog from '../../../shared/ui/SbDialog.vue';
import { dialogStore, closeAddProject } from '../../../dialogs/dialog-store.js';
import { useDialogKeys } from '../../../dialogs/use-dialog-keys.js';

const open = computed(() => !!dialogStore.addProject);
const path = ref('');
const error = ref('');
const pathInputRef = ref(null);

watch(open, async (isOpen) => {
  if (!isOpen) return;
  path.value = '';
  error.value = '';
  await nextTick();
  pathInputRef.value?.focus();
});

useDialogKeys('addProject', { onEscape: close, onEnter: add });

function close() { closeAddProject(); }

async function browse() {
  const folder = await api.browseFolder();
  if (folder) path.value = folder;
}

async function add() {
  const p = path.value.trim();
  if (!p) { error.value = 'Please enter a folder path.'; return; }
  error.value = '';
  const result = await api.addProject(p);
  if (result.error) { error.value = result.error; return; }
  const cb = dialogStore.addProject?.onAdd;
  close();
  cb?.();
}
</script>
