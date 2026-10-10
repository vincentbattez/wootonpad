<template>
  <SbDialog :open="open" overlay-class="add-project-overlay" dialog-class="add-project-dialog" @close="close">
    <h3>Add Project</h3>
    <div class="add-project-hint">{{ hint }}</div>
    <!-- Host picker (VIN-157). Shown only when Remote Hosts exist, so with none the dialog is the
         local flow unchanged. Default is Local Host, the current behaviour. -->
    <div class="add-project-host-row" v-if="hosts.length">
      <label for="add-project-host">Host</label>
      <select id="add-project-host" v-model="hostId">
        <option value="">Local Host</option>
        <option v-for="h in hosts" :key="h.id" :value="h.id">{{ h.name || h.sshTarget }}</option>
      </select>
    </div>
    <div class="folder-input-row">
      <input ref="pathInputRef" type="text" id="add-project-path" v-model="path"
        :placeholder="isRemote ? '/path/on/remote/host' : '/path/to/project'" autocomplete="off" spellcheck="false">
      <!-- The native folder picker can't browse another machine, so Browse is dropped for a Remote Host. -->
      <button class="add-project-browse-btn" v-if="!isRemote" @click="browse">Browse</button>
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
// The Remote Hosts the user can add a Project on, and which one is picked. Empty string = Local
// Host (the default), so the local add-project flow is unchanged (VIN-157).
const hosts = ref([]);
const hostId = ref('');
const isRemote = computed(() => !!hostId.value);
const hint = computed(() => isRemote.value
  ? 'Type a path to an existing folder on the Remote Host — WootonPad can\'t browse another machine for you.'
  : 'Select a folder to create a new project. To start a session in an existing project, use the + on its project header.');

watch(open, async (isOpen) => {
  if (!isOpen) return;
  path.value = '';
  error.value = '';
  hostId.value = '';
  hosts.value = (await api.getHosts?.()) || [];
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
  // A Remote Host is validated and keyed ssh://<hostId>/<path> in the main process; Local Host keeps
  // the original path-on-this-machine flow untouched.
  const result = isRemote.value
    ? await api.addRemoteProject(hostId.value, p)
    : await api.addProject(p);
  if (result?.error) { error.value = result.error; return; }
  const cb = dialogStore.addProject?.onAdd;
  close();
  cb?.();
}
</script>
