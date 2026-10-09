<template>
  <RemoteHostList
    :hosts="hostsStore.hosts"
    :reachability="hostsStore.reachability"
    :testing="hostsStore.testing"
    :results="hostsStore.results"
    @add-host="onAddHost"
    @remove-host="onRemoveHost"
    @add-account="onAddAccount"
    @remove-account="onRemoveAccount"
    @test="onTest"
  />
</template>

<script setup>
// The hosts Feature's one edge Container — the only hosts component that imports the service
// layer and reads the feature store. It loads the Hosts and their reachability off the preload
// IPC, turns each Dumb emit back into an IPC call, and subscribes to the main process's
// reachability pushes so a Host's badge flips within one probe interval of it going down or
// coming back (CONTEXT.md, Reachable). Every mutation returns the fresh Host list, which it
// writes straight into the store.
import { onMounted } from 'vue';
import { api } from '../../../shared/services/api.js';
import { hostsStore } from '../store.js';
import RemoteHostList from '../components/RemoteHostList.vue';

async function onAddHost(host, clear) {
  hostsStore.hosts = (await api.addHost?.(host)) || hostsStore.hosts;
  clear?.();
}

async function onRemoveHost(hostId) {
  hostsStore.hosts = (await api.removeHost?.(hostId)) || [];
}

async function onAddAccount(hostId, account, clear) {
  hostsStore.hosts = (await api.addRemoteAccount?.(hostId, account)) || hostsStore.hosts;
  clear?.();
}

async function onRemoveAccount(hostId, accountId) {
  hostsStore.hosts = (await api.removeRemoteAccount?.(hostId, accountId)) || hostsStore.hosts;
}

async function onTest(hostId) {
  hostsStore.testing = { ...hostsStore.testing, [hostId]: true };
  hostsStore.results = { ...hostsStore.results, [hostId]: null };
  try {
    const res = await api.testHostConnection?.(hostId);
    hostsStore.results = { ...hostsStore.results, [hostId]: res || null };
  } finally {
    hostsStore.testing = { ...hostsStore.testing, [hostId]: false };
  }
}

onMounted(async () => {
  hostsStore.hosts = (await api.getHosts?.()) || [];
  hostsStore.reachability = (await api.getHostReachability?.()) || {};
  api.onHostReachability?.((hostId, reachable) => {
    hostsStore.reachability = { ...hostsStore.reachability, [hostId]: reachable };
  });
});
</script>
