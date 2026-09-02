<template>
  <!-- Sidebar content panels (v-show keeps DOM alive for vanilla JS queries) -->
  <div id="sidebar-content" v-show="store.activeTab === 'sessions' && !store.accountSwitching">
    <SidebarSessionsContainer />
  </div>
  <div v-if="store.accountSwitching && store.activeTab === 'sessions'" id="account-switch-overlay" class="account-switch-preloader">
    <div class="acct-spinner"></div><span>Switching account…</span>
  </div>
</template>

<script setup>
// The Sessions tab: the Session/Project/Area tree, plus the account-switch overlay.
// It assembles the sessions Feature's sidebar Container and holds no logic of its own.
import { store } from '../store.js';
import SidebarSessionsContainer from '../features/sessions/containers/SidebarSessionsContainer.vue';
</script>
