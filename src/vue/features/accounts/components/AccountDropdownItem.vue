<template>
  <div
    class="acct-dd-item"
    :class="{ active: isActive }"
    @click="$emit('select', account.id)"
  >
    <span class="acct-dd-dot"></span>
    <span class="acct-dd-name">{{ account.name }}</span>
    <span class="acct-dd-chips">
      <span v-for="chip in chips" :key="chip" class="account-chip">{{ chip }}</span>
    </span>
  </div>
</template>

<script setup>
// One row in the sidebar account-switcher dropdown. Dumb: it takes the account, its active flag
// and its usage chips, and emits `select`. The chip computation is the pure usage module.
import { computed } from 'vue';
import { usageChips } from '../usage.mjs';

const props = defineProps({
  account: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  usage: { type: Object, default: null },
});

defineEmits(['select']);

const chips = computed(() => usageChips(props.usage));
</script>
