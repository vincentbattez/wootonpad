<template>
  <!-- The Local Host: the first node of the Host → Accounts tree, framed like a Host so local and
       remote Accounts read identically. It carries no sshTarget, badge, Test button or removal —
       the Local Host is simply there (CONTEXT.md, Local Host). -->
  <div class="project-group host-group">
    <div class="project-header host-header">
      <span class="project-name" v-html="hostSvg"></span>
      <span class="project-name">Local Host</span>
    </div>
    <div class="project-sessions">
      <AccountItem
        v-for="acc in accounts"
        :key="acc.id"
        :account="acc"
        :is-active="acc.id === activeAccountId"
        :usage="usage[acc.id]"
        @switch="(a) => $emit('switch', a)"
        @rename="(id, name) => $emit('rename', id, name)"
        @open-claude="(a) => $emit('open-claude', a)"
        @delete="(a) => $emit('delete', a)"
      />
    </div>
  </div>
</template>

<script setup>
// The Accounts panel list. The list and the item are always two components; this one renders a
// run of account rows and forwards every row event untouched. It derives nothing and owns no
// data — the active id and the usage map are handed in.
import AccountItem from './AccountItem.vue';
import { hostsIcons } from '../../../shared/lib/icons.js';

const { hostSvg } = hostsIcons;

defineProps({
  accounts: { type: Array, required: true },
  activeAccountId: { type: String, default: 'default' },
  usage: { type: Object, default: () => ({}) },
});

defineEmits(['switch', 'rename', 'open-claude', 'delete']);
</script>
