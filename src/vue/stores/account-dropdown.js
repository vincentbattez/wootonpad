import { reactive } from 'vue';

// The account-switcher dropdown's state. Kept separate from the Accounts panel
// store because app.js pushes to the two on their own schedules; `open` lives
// here so the bridge's close() can shut the dropdown reactively.
export const accountDropdownStore = reactive({
  accounts: [],
  activeAccountId: 'default',
  usage: {},
  open: false,
});
