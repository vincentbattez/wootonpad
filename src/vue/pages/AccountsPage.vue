<template>
  <div id="accounts-content" v-show="store.activeTab === 'accounts'">
    <AccountsContainer />
  </div>
</template>

<script setup>
// The Accounts tab: assembles the accounts Feature's edge Container and nothing else.
import { store } from '../store.js';
import AccountsContainer from '../features/accounts/containers/AccountsContainer.vue';
</script>
