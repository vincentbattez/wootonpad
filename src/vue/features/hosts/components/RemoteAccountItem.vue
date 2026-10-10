<template>
  <div class="session-item account-item">
    <div class="session-row">
      <div class="account-name-row">
        <div class="session-summary">{{ account.name }}</div>
        <div class="account-card-actions">
          <button
            v-if="account.id !== 'default'"
            class="account-row-del"
            data-tooltip="Remove account"
            @click.stop="$emit('remove', account)"
            v-html="trashSvg"
          ></button>
        </div>
      </div>
      <div class="session-subtitle">{{ account.configDir || '~/.claude (default)' }}</div>
    </div>
  </div>
</template>

<script setup>
// One Account row under a Remote Host. Dumb: it takes the account and emits `remove`; the Default
// Account can never be removed, so it shows no delete button. Reuses the Local Account row's
// classes verbatim so remote and local Accounts read identically.
import { hostsIcons } from '../../../shared/lib/icons.js';

const { trashSvg } = hostsIcons;

defineProps({
  account: { type: Object, required: true },
});

defineEmits(['remove']);
</script>
