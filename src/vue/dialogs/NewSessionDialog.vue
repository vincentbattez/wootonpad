<template>
  <SbDialog :open="!!session" overlay-class="new-session-overlay" dialog-class="new-session-dialog" @close="close">
    <h3>New Session — {{ shortPath(session?.project?.projectPath) }}</h3>
    <div class="settings-field">
      <div class="settings-label">Permission Mode</div>
      <div class="permission-grid">
        <button
          v-for="m in PERM_MODES" :key="String(m.value)"
          class="permission-option" :class="{ selected: !danger && mode === m.value }"
          @click="selectMode(m.value)"
        >
          <span class="perm-name">{{ m.label }}</span>
          <span class="perm-desc">{{ m.desc }}</span>
        </button>
        <button class="permission-option dangerous" :class="{ selected: danger }" @click="toggleDanger">
          <span class="perm-name">Dangerous Skip</span>
          <span class="perm-desc">Skip all safety prompts (use with caution)</span>
        </button>
      </div>
    </div>
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
import { dialogStore, closeNewSession } from './dialog-store.js';
import { useDialogKeys } from '../shared/composables/use-dialog-keys.js';

const PERM_MODES = [
  { value: null, label: 'Default', desc: 'Prompt for all actions' },
  { value: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-accept file edits, prompt for others' },
  { value: 'plan', label: 'Plan Mode', desc: 'Read-only exploration, no writes' },
  { value: 'dontAsk', label: "Don't Ask", desc: 'Auto-deny tools not explicitly allowed' },
  { value: 'bypassPermissions', label: 'Bypass', desc: 'Auto-accept all tool calls' },
];

const session = computed(() => dialogStore.newSession);
const mode = ref(null);
const danger = ref(false);
const worktree = ref(false);
const worktreeName = ref('');
const chrome = ref(false);
const preLaunch = ref('');
const addDirs = ref('');

// Seed the form from the effective options the moment the dialog opens.
watch(session, (s) => {
  if (!s) return;
  const e = s.effective;
  mode.value = e.permissionMode || null;
  danger.value = !!e.dangerouslySkipPermissions;
  worktree.value = !!e.worktree;
  worktreeName.value = e.worktreeName || '';
  chrome.value = !!e.chrome;
  preLaunch.value = e.preLaunchCmd || '';
  addDirs.value = e.addDirs || '';
});

useDialogKeys(() => !!dialogStore.newSession, { onEscape: close, onEnter: start });

function close() { closeNewSession(); }

function selectMode(m) { danger.value = false; mode.value = m; }
function toggleDanger() { danger.value = !danger.value; if (danger.value) mode.value = null; }
function onWorktreeInput() { if (worktreeName.value.trim()) worktree.value = true; }

function start() {
  const s = dialogStore.newSession;
  if (!s) return;
  const options = {};
  if (danger.value) {
    options.dangerouslySkipPermissions = true;
  } else if (mode.value) {
    options.permissionMode = mode.value;
  }
  if (worktree.value) { options.worktree = true; options.worktreeName = worktreeName.value.trim(); }
  if (chrome.value) options.chrome = true;
  if (preLaunch.value.trim()) options.preLaunchCmd = preLaunch.value.trim();
  options.addDirs = addDirs.value.trim();
  if (s.effective?.mcpEmulation === false) options.mcpEmulation = false;
  const cb = s.onStart;
  close();
  cb?.(options);
}

function shortPath(p) { return (p || '').split('/').filter(Boolean).slice(-2).join('/'); }
</script>
