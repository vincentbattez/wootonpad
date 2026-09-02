<template>
  <div class="project-group">
    <div class="project-header">
      <span class="project-name">Accounts</span>
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

defineProps({
  accounts: { type: Array, required: true },
  activeAccountId: { type: String, default: 'default' },
  usage: { type: Object, default: () => ({}) },
});

defineEmits(['switch', 'rename', 'open-claude', 'delete']);
</script>
