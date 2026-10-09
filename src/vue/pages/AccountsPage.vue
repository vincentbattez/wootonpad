<template>
  <div id="accounts-content" v-show="store.activeTab === 'accounts'">
    <!-- The Accounts tab is the Host → Accounts tree: the Local Host (today's Accounts, unchanged)
         first, the Remote Hosts below it (VIN-153). -->
    <AccountsContainer />
    <HostsContainer />
  </div>
</template>

<script setup>
// The Accounts tab: assembles the Local Host's accounts Container and the Remote Hosts Container.
import { store } from '../store.js';
import AccountsContainer from '../features/accounts/containers/AccountsContainer.vue';
import HostsContainer from '../features/hosts/containers/HostsContainer.vue';
</script>
