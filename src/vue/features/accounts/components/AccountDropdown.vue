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
    <AccountDropdownItem
      v-for="acc in accounts"
      :key="acc.id"
      :account="acc"
      :is-active="acc.id === activeAccountId"
      :usage="usage[acc.id]"
      @select="(id) => $emit('select', id)"
    />
  </div>
</template>

<script setup>
// The sidebar account switcher: the active-account button and, while open, the list of accounts.
// Dumb — the list, the active id, the usage map and the open flag are handed in; it emits
// `toggle` and `select`. The list and the item are two components. The button's inline chevron
// is markup, not an icon string, so it stays with the button.
import { computed } from 'vue';
import AccountDropdownItem from './AccountDropdownItem.vue';
import { usageChips } from '../usage.mjs';

const props = defineProps({
  accounts: { type: Array, required: true },
  activeAccountId: { type: String, default: 'default' },
  usage: { type: Object, default: () => ({}) },
  open: { type: Boolean, default: false },
});

defineEmits(['toggle', 'select']);

const activeName = computed(() => {
  const acc = props.accounts.find(a => a.id === props.activeAccountId);
  return acc?.name ?? 'Default';
});

const activeChips = computed(() => usageChips(props.usage[props.activeAccountId]));
</script>
