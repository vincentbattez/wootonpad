<template>
  <div class="project-group">
    <div class="project-header" :class="{ collapsed: !open }" @click="open = !open">
      <span class="arrow">&#9660;</span>
      <span class="project-name">Add account</span>
    </div>
    <div class="project-sessions accounts-add-section">
      <p class="accounts-add-desc">Each account uses its own Claude credentials and session history. Add a second account to switch between personal and work Claude Pro plans, or any two separate logins.</p>
      <div class="accounts-add-form">
        <input
          v-model="newName"
          placeholder="Account name (e.g. Work / Personal)"
          @keydown.enter="add"
        />
        <div class="text-center">
          <button class="btn-green" :disabled="adding" @click="add">
            {{ adding ? 'Adding…' : 'Add account' }}
          </button>
        </div>
      </div>

      <div v-if="wslHomes.length" class="accounts-add-form accounts-wsl-section">
        <p class="accounts-add-desc">
          Claude also runs inside WSL. Attach an account to a distribution to browse
          the sessions it stores there, alongside the ones on Windows.
        </p>
        <div v-for="home in wslHomes" :key="home.distro" class="accounts-wsl-row">
          <span class="accounts-wsl-name">{{ home.distro }}</span>
          <span class="accounts-wsl-path">{{ home.claudePosix }}</span>
          <button
            class="btn-green"
            :disabled="addingWsl === home.distro || hasWslAccount(home.distro)"
            @click="$emit('add-wsl', home)"
          >
            {{ hasWslAccount(home.distro) ? 'Added' : (addingWsl === home.distro ? 'Adding…' : 'Attach') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// The "Add account" section: the collapsible form for a new local account, plus the WSL rows the
// Container discovers. Dumb — it owns only the draft name and the collapse flag, and emits `add`
// (with the trimmed name) and `add-wsl`; the busy flags and the discovered homes are handed in.
import { ref, computed } from 'vue';

const props = defineProps({
  // The current account list, so an already-attached distribution reads as "Added".
  accounts: { type: Array, required: true },
  // Distributions holding a reachable Claude home; empty off Windows and when none has one.
  wslHomes: { type: Array, default: () => [] },
  adding: { type: Boolean, default: false },
  addingWsl: { type: String, default: null },
});

const emit = defineEmits(['add', 'add-wsl']);

const newName = ref('');
const open = ref(false);

function add() {
  const name = newName.value.trim();
  if (!name) return;
  emit('add', name, () => { newName.value = ''; });
}

function hasWslAccount(distro) {
  return props.accounts.some(a => a.wslDistro === distro);
}
</script>
