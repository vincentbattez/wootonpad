import { reactive } from 'vue';

// The Accounts panel's state, written through window.vueAccounts.
export const accountsStore = reactive({
  accounts: [],
  activeAccountId: 'default',
  usage: {},
});
