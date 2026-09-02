import { reactive } from 'vue';

// The accounts Feature store. Two slices the feature owns, kept apart because the frozen
// renderer pushes to them on their own schedules: the Accounts panel (its list, the active
// account and per-account usage) and the sidebar account-switcher dropdown (the same three
// plus its open flag). The feature's Bridge writes here; a Dumb Component reads it only
// through the Container.

// The Accounts panel: the list, the active account and usage, written through window.vueAccounts.
export const accountsStore = reactive({
  accounts: [],
  activeAccountId: 'default',
  usage: {},
});

// The sidebar account-switcher dropdown, written through window.vueAccountDropdown.
export const accountDropdownStore = reactive({
  accounts: [],
  activeAccountId: 'default',
  usage: {},
  open: false,
});
