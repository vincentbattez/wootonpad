<template>
  <SettingsPanel
    :title="title"
    :loading="loading"
    :is-project="isProject"
    :form="form"
    :use-global="useGlobal"
    :save-state="saveState"
    :ide-notice="ideNotice"
    :app-version="appVersion"
    :update-status="updateStatus"
    :new-version="newVersion"
    :shell-profiles="shellProfiles"
    :terminal-themes="terminalThemes"
    :terminal-fonts="terminalFonts"
    :external-ide-presets="externalIdePresets"
    @save="save"
    @cancel="close"
    @remove-project="removeProject"
    @check-updates="checkUpdates"
    @open-releases="openReleasesPage"
  />
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../../../shared/services/api.js';
import { settingsStore } from '../store.js';
import SettingsPanel from '../components/SettingsPanel.vue';

// The settings Feature's edge Container: the one component that imports the service layer and
// reads the feature store. It owns loading, saving and the "use global" override maths, hands
// the Dumb SettingsPanel its reactive `form`/`useGlobal` objects, and turns the panel's emits
// into service calls. The panel and the settings-field are Dumb; all side effects live here.

// ── Derived from store ────────────────────────────────────────────
const isProject = computed(() => settingsStore.settingsScope === 'project');
const projectPath = computed(() => settingsStore.settingsProjectPath);
const settingsKey = computed(() => isProject.value ? 'project:' + projectPath.value : 'global');
const title = computed(() => {
  const shortName = isProject.value
    ? (projectPath.value?.split('/').filter(Boolean).slice(-2).join('/') || projectPath.value)
    : 'Global';
  return (isProject.value ? 'Project Settings — ' : 'Global Settings — ') + shortName;
});

// ── Local state ───────────────────────────────────────────────────
const loading = ref(true);
const saveState = ref('idle'); // 'idle' | 'saved'
const ideNotice = ref('');
const appVersion = ref('');
const updateStatus = ref('');
const newVersion = ref('');
const shellProfiles = ref([]);
const terminalThemes = computed(() => window.TERMINAL_THEMES || {});
const terminalFonts = computed(() => window.TERMINAL_FONTS || {});

const COMMIT_MSG_PROMPT_DEFAULT = `Write a concise git commit message (max 72 chars for first line) for these changes. Use conventional commit format (feat/fix/refactor/docs/chore). Output ONLY the commit message, no explanation:`;

// The fields a Project can either inherit from global or override, with their global-scope
// defaults. Both loading and saving walk this list, and `useGlobal` tracks one flag per field.
const OVERRIDE_DEFAULTS = {
  permissionMode: '', worktree: false, worktreeName: '', chrome: false,
  preLaunchCmd: '', externalIdeCommand: '', runCommand: '', addDirs: '',
};
const OVERRIDE_FIELDS = Object.keys(OVERRIDE_DEFAULTS);

// Prefill only — an External IDE is identified by its command, never by an id.
const externalIdePresets = [
  { name: 'VS Code', command: 'code {path}' },
  { name: 'VS Code (new window)', command: 'code -n {path}' },
  { name: 'Cursor', command: 'cursor {path}' },
  { name: 'Windsurf', command: 'windsurf {path}' },
  { name: 'Zed', command: 'zed {path}' },
  { name: 'WebStorm', command: 'webstorm {path}' },
  { name: 'IntelliJ IDEA', command: 'idea {path}' },
  { name: 'PyCharm', command: 'pycharm {path}' },
  { name: 'Xcode', command: 'xed {path}' },
  { name: 'Sublime Text', command: 'subl {path}' },
];

const form = reactive({
  permissionMode: '',
  worktree: false,
  worktreeName: '',
  chrome: false,
  preLaunchCmd: '',
  externalIdeCommand: '',
  runCommand: '',
  addDirs: '',
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,
  terminalTheme: 'auto',
  theme: 'system',
  neutralTone: 'mauve',
  mcpEmulation: true,
  shellProfile: 'auto',
  showAvatars: true,
  monoFont: 'default',
  uiFont: 'default',
  commitMessagePrompt: '',
  gitlabToken: '',
});

const useGlobal = reactive({
  permissionMode: true,
  worktree: true,
  worktreeName: true,
  chrome: true,
  preLaunchCmd: true,
  externalIdeCommand: true,
  runCommand: true,
  addDirs: true,
});

let originalMcpEmulation = true;

// ── Helpers ───────────────────────────────────────────────────────
function effectiveValue(current, global, field, fallback) {
  if (isProject.value && (current[field] === undefined || current[field] === null)) {
    return global[field] !== undefined ? global[field] : fallback;
  }
  return current[field] !== undefined ? current[field] : fallback;
}

function isUsingGlobal(current, field) {
  return current[field] === undefined || current[field] === null;
}

// ── Load settings ─────────────────────────────────────────────────
async function loadSettings() {
  loading.value = true;
  const current = (await api.getSetting(settingsKey.value)) || {};
  const global = isProject.value ? ((await api.getSetting('global')) || {}) : {};

  for (const field of OVERRIDE_FIELDS) {
    if (isProject.value) {
      useGlobal[field] = isUsingGlobal(current, field);
    }
    form[field] = effectiveValue(current, global, field, OVERRIDE_DEFAULTS[field]);
  }

  if (!isProject.value) {
    form.visibleSessionCount = current.visibleSessionCount ?? 10;
    form.sessionMaxAgeDays = current.sessionMaxAgeDays ?? 3;
    form.terminalTheme = current.terminalTheme ?? 'auto';
    form.theme = current.theme ?? 'system';
    form.neutralTone = current.neutralTone ?? 'mauve';
    form.mcpEmulation = current.mcpEmulation !== false;
    form.shellProfile = current.shellProfile ?? 'auto';
    form.showAvatars = current.showAvatars !== false;
    form.monoFont = current.monoFont ?? 'default';
    form.uiFont = current.uiFont ?? 'default';
    form.commitMessagePrompt = current.commitMessagePrompt || COMMIT_MSG_PROMPT_DEFAULT;
    form.gitlabToken = current.gitlabToken || '';
    originalMcpEmulation = form.mcpEmulation;

    try { shellProfiles.value = await api.getShellProfiles(); } catch { shellProfiles.value = []; }
    api.getAppVersion().then(v => { appVersion.value = v; });
  }

  loading.value = false;
}

// ── Save ──────────────────────────────────────────────────────────
async function save() {
  let settings = {};

  if (isProject.value) {
    for (const field of OVERRIDE_FIELDS) {
      if (!useGlobal[field]) {
        settings[field] = form[field];
      }
    }
  } else {
    const existing = (await api.getSetting('global')) || {};
    settings = {
      ...existing,
      permissionMode: form.permissionMode || null,
      worktree: form.worktree,
      worktreeName: form.worktreeName,
      chrome: form.chrome,
      preLaunchCmd: form.preLaunchCmd,
      externalIdeCommand: form.externalIdeCommand,
      runCommand: form.runCommand,
      addDirs: form.addDirs,
      visibleSessionCount: form.visibleSessionCount || 10,
      sessionMaxAgeDays: form.sessionMaxAgeDays || 3,
      terminalTheme: form.terminalTheme || 'auto',
      theme: form.theme || 'system',
      neutralTone: form.neutralTone || 'mauve',
      mcpEmulation: form.mcpEmulation,
      shellProfile: form.shellProfile || 'auto',
      showAvatars: form.showAvatars,
      monoFont: form.monoFont || 'default',
      uiFont: form.uiFont || 'default',
      commitMessagePrompt: form.commitMessagePrompt === COMMIT_MSG_PROMPT_DEFAULT ? '' : (form.commitMessagePrompt || ''),
      gitlabToken: form.gitlabToken || '',
    };
  }

  await api.setSetting(settingsKey.value, settings);

  if (!isProject.value) {
    window._setVisibleSessionCount?.(settings.visibleSessionCount);
    window._setSessionMaxAge?.(settings.sessionMaxAgeDays);
    api.applyAppearance?.(); // main broadcasts back, the renderer applies it
    window._setShowAvatars?.(settings.showAvatars);
    if (window.TERMINAL_FONTS?.[settings.monoFont]) {
      window._applyTerminalFont?.(window.TERMINAL_FONTS[settings.monoFont].family);
    }
    window._applyUiFont?.(settings.uiFont);
    if (typeof window.refreshSidebar === 'function') window.refreshSidebar();

    if (settings.mcpEmulation !== originalMcpEmulation) {
      ideNotice.value = 'IDE Emulation setting changed. New sessions will use the updated setting — running sessions are not affected.';
      setTimeout(() => { ideNotice.value = ''; }, 8000);
    }
  }

  saveState.value = 'saved';
  setTimeout(() => close(), 600);
}

// ── Close ─────────────────────────────────────────────────────────
function close() {
  settingsStore.settingsOpen = false;
  window._restoreAfterSettings?.();
}

// ── Remove project ────────────────────────────────────────────────
async function removeProject() {
  const shortName = projectPath.value?.split('/').filter(Boolean).slice(-2).join('/') || projectPath.value;
  if (!confirm(`Hide project "${shortName}" from WootonPad?\n\nThis hides the project from the sidebar. Your session files are not deleted.`)) return;
  await api.removeProject(projectPath.value);
  settingsStore.settingsOpen = false;
  if (typeof window.loadProjects === 'function') window.loadProjects();
}

// ── Updates ───────────────────────────────────────────────────────
function checkUpdates() { api.updaterCheck(); }
function openReleasesPage() { api.openExternal('https://github.com/fortael/wootonpad/releases/latest'); }

// ── Lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  await loadSettings();
  if (!isProject.value) {
    api.onUpdaterEvent((type, data) => {
      switch (type) {
        case 'checking': updateStatus.value = 'checking…'; newVersion.value = ''; break;
        case 'update-available': updateStatus.value = `v${data.version} available`; newVersion.value = data.version; break;
        case 'update-not-available': updateStatus.value = 'up to date'; newVersion.value = ''; break;
        case 'error': updateStatus.value = 'check failed'; newVersion.value = ''; break;
      }
    });
  }
});
</script>
