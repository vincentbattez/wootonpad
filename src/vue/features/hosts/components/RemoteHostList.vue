<template>
  <div class="host-tree">
    <div class="project-group">
      <div class="project-header">
        <span class="project-name" v-html="hostSvg"></span>
        <span class="project-name">Remote Hosts</span>
      </div>
      <div class="project-sessions">
        <p class="accounts-add-desc">
          A Remote Host runs Claude Sessions on another machine over SSH. Add one by its name and an
          SSH target — an alias from your <code>~/.ssh/config</code>, or <code>user@host</code>.
        </p>

        <RemoteHostItem
          v-for="host in hosts"
          :key="host.id"
          :host="host"
          :reachable="reachability[host.id]"
          :testing="!!testing[host.id]"
          :result="results[host.id] || null"
          @test="(id) => $emit('test', id)"
          @remove-host="(id) => $emit('remove-host', id)"
          @add-account="(hostId, acc, clear) => $emit('add-account', hostId, acc, clear)"
          @remove-account="(hostId, accId) => $emit('remove-account', hostId, accId)"
        />

        <div class="accounts-add-form host-add-form">
          <input v-model="name" placeholder="Host name (e.g. Mac Mini)" @keydown.enter="add" />
          <input v-model="sshTarget" placeholder="SSH target (e.g. mac-mini or user@host)" @keydown.enter="add" />
          <div class="text-center">
            <button class="btn-green" @click="add">Add host</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// The Remote Hosts section of the Accounts tab, sitting below the Local Host. Dumb: it renders a
// card per Host and owns only the two draft inputs for a new Host, emitting `add-host` with the
// trimmed values and forwarding every per-Host event untouched. The Host list, reachability, the
// busy flags and the results are all handed in.
import { ref } from 'vue';
import RemoteHostItem from './RemoteHostItem.vue';
import { hostsIcons } from '../../../shared/lib/icons.js';

const { hostSvg } = hostsIcons;

defineProps({
  hosts: { type: Array, required: true },
  reachability: { type: Object, default: () => ({}) },
  testing: { type: Object, default: () => ({}) },
  results: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['add-host', 'remove-host', 'add-account', 'remove-account', 'test']);

const name = ref('');
const sshTarget = ref('');

function add() {
  const n = name.value.trim();
  const t = sshTarget.value.trim();
  if (!n || !t) return;
  emit('add-host', { name: n, sshTarget: t }, () => {
    name.value = '';
    sshTarget.value = '';
  });
}
</script>
