<template>
  <button class="account-btn-vue" data-tooltip="Switch account" @click.stop="$emit('toggle')">
    <span class="account-btn-dot"></span>
    <span class="account-btn-name">{{ activeName }}</span>
    <span class="account-btn-chips">
      <span v-for="chip in activeChips" :key="chip" class="account-chip">{{ chip }}</span>
    </span>
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 1l4 4 4-4"/>
    </svg>
  </button>

  <div v-if="open" class="account-dropdown-vue">
    <!-- One group per Host (CONTEXT.md: the switcher lists Accounts grouped by Host). With only the
         Local Host, `grouped` is false and the header is suppressed, so the dropdown stays the flat
         list it has always been; as soon as any Remote Host is present it groups by Host, whatever
         the per-Host Account count. The always-visible header button is what stays unchanged with one
         Account per Host (VIN-158). -->
    <div v-for="group in groups" :key="group.hostId == null ? 'local' : group.hostId" class="acct-dd-group">
      <div v-if="grouped" class="acct-dd-group-header">
        <span class="acct-dd-group-icon" v-html="hostSvg"></span>
        <span class="acct-dd-group-name">{{ group.name }}</span>
      </div>
      <AccountDropdownItem
        v-for="acc in group.accounts"
        :key="acc.id"
        :account="acc"
        :is-active="acc.id === group.activeAccountId"
        :usage="group.hostId == null ? usage[acc.id] : null"
        :remote="group.hostId != null"
        @select="(id) => group.hostId == null ? $emit('select', id) : $emit('select-remote', group.hostId, id)"
      />
    </div>
  </div>
</template>

<script setup>
// The sidebar account switcher: the active-account button and, while open, the Accounts grouped by
// Host. Dumb — the local list, the active id, the usage map, the open flag and the Remote Hosts are
// handed in; it emits `toggle`, `select` (a Local Account) and `select-remote` (a Host's Account).
// The button's header keeps showing the Local Host's active Account, unchanged by grouping. The
// grouping maths is the pure switcher module; the button's inline chevron is markup, not an icon
// string, so it stays with the button.
import { computed } from 'vue';
import AccountDropdownItem from './AccountDropdownItem.vue';
import { usageChips } from '../usage.mjs';
import { switcherGroups, isGrouped } from '../switcher.mjs';
import { hostsIcons } from '../../../shared/lib/icons.js';

const props = defineProps({
  accounts: { type: Array, required: true },
  activeAccountId: { type: String, default: 'default' },
  usage: { type: Object, default: () => ({}) },
  open: { type: Boolean, default: false },
  // The Remote Hosts and their Accounts (CONTEXT.md, Host / Account). Empty by default, so the
  // switcher is the flat local list until a Remote Host is added.
  hosts: { type: Array, default: () => [] },
});

defineEmits(['toggle', 'select', 'select-remote']);

const { hostSvg } = hostsIcons;

const activeName = computed(() => {
  const acc = props.accounts.find(a => a.id === props.activeAccountId);
  return acc?.name ?? 'Default';
});

const activeChips = computed(() => usageChips(props.usage[props.activeAccountId]));

const groups = computed(() => switcherGroups({
  accounts: props.accounts, activeAccountId: props.activeAccountId, hosts: props.hosts,
}));
const grouped = computed(() => isGrouped(props.hosts));
</script>
