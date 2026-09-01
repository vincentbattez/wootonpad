import { reactive } from 'vue';

// The account-switcher dropdown. Separate from the Accounts panel store because
// app.js pushes to the two on their own schedules.
export const accountDropdownStore = reactive({
  accounts: [],
  activeAccountId: 'default',
  usage: {},
  open: false,
});
