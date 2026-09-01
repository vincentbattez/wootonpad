import { reactive } from 'vue';

// The Accounts panel's state. Standalone feature store written through
// window.vueAccounts and read reactively by AccountsApp.
export const accountsStore = reactive({
  accounts: [],
  activeAccountId: 'default',
  usage: {},
});
