<template>
  <!-- The permission-mode picker shared by the new-session and resume dialogs. Selecting a mode
       clears the dangerous-skip toggle and vice versa, so the two never appear selected together. -->
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
</template>

<script setup>
const props = defineProps({
  mode: { type: String, default: null },
  danger: { type: Boolean, default: false },
});
const emit = defineEmits(['update:mode', 'update:danger']);

const PERM_MODES = [
  { value: null, label: 'Default', desc: 'Prompt for all actions' },
  { value: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-accept file edits, prompt for others' },
  { value: 'plan', label: 'Plan Mode', desc: 'Read-only exploration, no writes' },
  { value: 'dontAsk', label: "Don't Ask", desc: 'Auto-deny tools not explicitly allowed' },
  { value: 'bypassPermissions', label: 'Bypass', desc: 'Auto-accept all tool calls' },
];

function selectMode(m) { emit('update:danger', false); emit('update:mode', m); }
function toggleDanger() {
  const next = !props.danger;
  emit('update:danger', next);
  if (next) emit('update:mode', null);
}
</script>
