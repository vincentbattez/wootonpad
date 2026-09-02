<template>
  <StatusBar
    :info="statusBarStore.info"
    :activity="statusBarStore.activity"
    :activity-class="statusBarStore.activityClass"
    :updater="statusBarStore.updater"
  />
</template>

<script setup>
// The status-bar Feature's edge Container: reads the feature store and hands the
// three slots to the Dumb StatusBar. The store is filled by the feature bridge.
import { statusBarStore } from '../store.js';
import StatusBar from '../components/StatusBar.vue';
</script>
