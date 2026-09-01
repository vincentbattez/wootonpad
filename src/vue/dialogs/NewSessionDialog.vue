<template>
  <SbDialog :open="!!request" overlay-class="new-session-overlay" dialog-class="new-session-dialog" @close="close">
    <h3>New Session — {{ shortPath(request?.project?.projectPath) }}</h3>
    <PermissionModeGrid v-model:mode="mode" v-model:danger="danger" />
    <div class="settings-field">
      <div class="settings-field-info">
        <span class="settings-label">Worktree</span>
        <div class="settings-description">Run session in an isolated git worktree</div>
      </div>
      <div class="settings-field-control">
        <input type="text" class="settings-input" v-model="worktreeName"
          placeholder="name (optional)" style="width:140px" @input="onWorktreeInput">
        <SbSwitch v-model="worktree" />
      </div>
    </div>
    <div class="settings-field">
      <div class="settings-field-info">
        <span class="settings-label">Chrome</span>
        <div class="settings-description">Enable Chrome browser automation</div>
      </div>
      <div class="settings-field-control">
        <SbSwitch v-model="chrome" />
      </div>
    </div>
    <div class="settings-field settings-field-wide">
      <div class="settings-field-info">
        <span class="settings-label">Pre-launch Command</span>
        <div class="settings-description">Prepended to the claude command</div>
      </div>
      <div class="settings-field-control">
        <input type="text" class="settings-input" v-model="preLaunch"
          placeholder="e.g. aws-vault exec profile --">
      </div>
    </div>
    <div class="settings-field settings-field-wide">
      <div class="settings-field-info">
        <span class="settings-label">Additional Directories</span>
        <div class="settings-description">Extra directories to include (comma-separated)</div>
      </div>
      <div class="settings-field-control">
        <input type="text" class="settings-input" v-model="addDirs"
          placeholder="/path/to/dir1, /path/to/dir2">
      </div>
    </div>
    <div class="new-session-actions">
      <button class="new-session-cancel-btn" @click="close">Cancel</button>
      <button class="btn-green" @click="start">Start</button>
    </div>
  </SbDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import SbDialog from '../shared/ui/SbDialog.vue';
import SbSwitch from '../components/SbSwitch.vue';
import PermissionModeGrid from '../shared/ui/PermissionModeGrid.vue';
import { dialogStore, closeNewSession } from './dialog-store.js';
import { useDialogKeys } from './use-dialog-keys.js';
import { useSessionOptions } from './use-session-options.js';

const request = computed(() => dialogStore.newSession);
const { mode, danger, chrome, preLaunch, addDirs, seed, toOptions } = useSessionOptions();
const worktree = ref(false);
const worktreeName = ref('');

// Seed the form from the effective options the moment the dialog opens.
watch(request, (r) => {
  if (!r) return;
  seed(r.effective);
  worktree.value = !!r.effective.worktree;
  worktreeName.value = r.effective.worktreeName || '';
});

useDialogKeys('newSession', { onEscape: close, onEnter: start });

function close() { closeNewSession(); }

function onWorktreeInput() { if (worktreeName.value.trim()) worktree.value = true; }

function start() {
  const r = dialogStore.newSession;
  if (!r) return;
  const options = toOptions(r.effective);
  if (worktree.value) { options.worktree = true; options.worktreeName = worktreeName.value.trim(); }
  const cb = r.onStart;
  close();
  cb?.(options);
}

function shortPath(p) { return (p || '').split('/').filter(Boolean).slice(-2).join('/'); }
</script>
