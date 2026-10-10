<template>
  <!-- The Accounts panel, in the accounts tab. -->
  <div>
    <AccountList
      :accounts="accountsStore.accounts"
      :active-account-id="accountsStore.activeAccountId"
      :usage="accountsStore.usage"
      @switch="onSwitch"
      @rename="onRename"
      @open-claude="onOpenClaude"
      @delete="onDelete"
    />
    <AccountAddForm
      :accounts="accountsStore.accounts"
      :wsl-homes="wslHomes"
      :adding="adding"
      :adding-wsl="addingWsl"
      @add="onAdd"
      @add-wsl="onAddWsl"
    />
  </div>

  <!-- The account switcher, Teleported back to its sidebar mount point. -->
  <Teleport to="#account-selector">
    <AccountDropdown
      :accounts="dropdownStore.accounts"
      :active-account-id="dropdownStore.activeAccountId"
      :usage="dropdownStore.usage"
      :open="dropdownStore.open"
      :hosts="remoteHosts"
      @toggle="onToggleDropdown"
      @select="onDropdownSelect"
      @select-remote="onDropdownSelectRemote"
    />
  </Teleport>
</template>

<script setup>
// The accounts Feature's one edge Container — the only accounts component that imports the
// service layer and reads the feature store. It resolves the panel and the switcher off the two
// store slices the Bridge writes, turns each Dumb emit back into a service call, and owns the
// side effects the rows must not: the create/attach busy flags, the delete confirm, the WSL-home
// discovery and the dropdown's close-on-outside-click. The switcher is Teleported to
// #account-selector so the Feature owns it while it stays at the same mount point.
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { sb } from '../../../shared/services/sb.js';
import { api } from '../../../shared/services/api.js';
import { accountsStore, accountDropdownStore as dropdownStore } from '../store.js';
import AccountList from '../components/AccountList.vue';
import AccountAddForm from '../components/AccountAddForm.vue';
import AccountDropdown from '../components/AccountDropdown.vue';

// ── Panel row actions ─────────────────────────────────────────────
async function onSwitch(acc) {
  if (acc.id !== accountsStore.activeAccountId) await sb.switchAccount?.(acc.id);
}

function onRename(id, name) {
  if (name) sb.renameAccount?.(id, name);
}

function onOpenClaude(acc) { sb.openAccountHomeSession?.(acc); }

function onDelete(acc) {
  if (!confirm(`Remove account "${acc.name}"?`)) return;
  sb.deleteAccount?.(acc.id);
}

// ── Add account ───────────────────────────────────────────────────
const adding = ref(false);

async function onAdd(name, clear) {
  adding.value = true;
  const created = await sb.createAccount?.(name);
  adding.value = false;
  if (created) clear();
}

// ── WSL homes ─────────────────────────────────────────────────────
// Distributions holding a reachable Claude home. Empty off Windows, and empty when no
// distribution has one — the section stays hidden in both cases.
const wslHomes = ref([]);
const addingWsl = ref(null);
// Probing starts a distribution, so it happens once per window rather than on every accounts
// refresh — including when the answer is "none".
let wslHomesLoaded = false;

async function loadWslHomes() {
  if (wslHomesLoaded) return;
  wslHomesLoaded = true;
  try {
    wslHomes.value = (await sb.discoverWslClaudeHomes?.()) || [];
  } catch {
    wslHomes.value = [];
  }
}

async function onAddWsl(home) {
  addingWsl.value = home.distro;
  try {
    const created = await sb.createWslAccount?.(home.distro);
    if (created?.error) alert(created.error);
  } finally {
    addingWsl.value = null;
  }
}

// immediate: the Bridge is installed before this mounts, so the list may already be there.
watch(() => accountsStore.accounts, loadWslHomes, { immediate: true });

// ── Dropdown ──────────────────────────────────────────────────────
// The switcher lists Accounts grouped by Host (VIN-158). The Local Host's part comes through the
// frozen renderer's dropdown bridge (dropdownStore); the Remote Hosts are read straight off the
// preload IPC here, the way HostsContainer owns its own Host IPC — the accounts Bridge never learns
// about Hosts. Loaded on mount and refreshed each time the dropdown opens, so an Account added or
// removed on the Accounts tab is reflected the next time the switcher is opened.
const remoteHosts = ref([]);

async function loadRemoteHosts() {
  try {
    remoteHosts.value = (await api.getHosts?.()) || [];
  } catch {
    remoteHosts.value = [];
  }
}

function onToggleDropdown() {
  dropdownStore.open = !dropdownStore.open;
  if (dropdownStore.open) loadRemoteHosts();
}

async function onDropdownSelect(id) {
  dropdownStore.open = false;
  if (id !== dropdownStore.activeAccountId) await sb.switchAccount?.(id);
}

// Picking a Remote Host's Account changes that Host's active Account only: the Local Host part of
// the sidebar does not move. The main process re-points the Host's mirror and swaps its Remote
// Projects; the returned fresh Host list updates the switcher's check without a re-open.
async function onDropdownSelectRemote(hostId, accountId) {
  dropdownStore.open = false;
  const hosts = await api.setRemoteActiveAccount?.(hostId, accountId);
  if (Array.isArray(hosts)) remoteHosts.value = hosts;
}

// Any click outside closes the open dropdown; the button's @click.stop keeps opening it from
// closing on the same event.
function onDocumentClick() { dropdownStore.open = false; }
onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  loadRemoteHosts();
});
onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>
