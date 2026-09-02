<template>
  <SbDialog :open="!!request" overlay-class="new-session-overlay" dialog-class="new-session-dialog" @close="close">
    <h3>Resume Session — {{ sessionName }}</h3>
    <PermissionModeGrid v-model:mode="mode" v-model:danger="danger" />
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
      <button class="btn-green" @click="resume">Resume</button>
    </div>
  </SbDialog>
</template>

<script setup>
import { computed, watch } from 'vue';
import SbDialog from '../shared/ui/SbDialog.vue';
import SbSwitch from '../shared/ui/SbSwitch.vue';
import PermissionModeGrid from '../shared/ui/PermissionModeGrid.vue';
import { dialogStore, closeResumeSession } from './dialog-store.js';
import { useDialogKeys } from './use-dialog-keys.js';
import { useSessionOptions } from './use-session-options.js';

const request = computed(() => dialogStore.resumeSession);
const { mode, danger, chrome, preLaunch, addDirs, seed, toOptions } = useSessionOptions();

const sessionName = computed(() => {
  const s = request.value?.session;
  return s ? (s.name || s.aiTitle || s.summary || s.sessionId?.slice(0, 8) || '') : '';
});

watch(request, (r) => {
  if (r) seed(r.effective);
});

useDialogKeys('resumeSession', { onEscape: close, onEnter: resume });

function close() { closeResumeSession(); }

function resume() {
  const r = dialogStore.resumeSession;
  if (!r) return;
  const options = toOptions(r.effective);
  const cb = r.onResume;
  close();
  cb?.(options);
}
</script>
