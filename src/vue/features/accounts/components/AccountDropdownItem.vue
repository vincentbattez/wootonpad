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
    <span v-if="isActive" class="acct-dd-check" v-html="checkSvg"></span>
  </div>
</template>

<script setup>
// One row in the sidebar account-switcher dropdown. Dumb: it takes the account, its active flag, its
// usage and whether it is a Remote Account, and emits `select`. A Remote Account's usage shows "—"
// (out of v1), a Local Account's its real chips — both via the pure switcher module. The active
// Account carries a check (CONTEXT.md: a check on each Host's active Account).
import { computed } from 'vue';
import { switcherChips } from '../switcher.mjs';
import { accountsIcons } from '../../../shared/lib/icons.js';

const props = defineProps({
  account: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  usage: { type: Object, default: null },
  remote: { type: Boolean, default: false },
});

defineEmits(['select']);

const { checkSvg } = accountsIcons;

const chips = computed(() => switcherChips(props.usage, props.remote));
</script>
