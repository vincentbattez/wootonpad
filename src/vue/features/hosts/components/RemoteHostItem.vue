<template>
  <div class="project-group host-group">
    <div class="project-header host-header">
      <span class="project-name">{{ host.name }}</span>
      <span class="host-target">{{ host.sshTarget }}</span>
      <span class="host-badge" :class="badgeClass">{{ badgeLabel }}</span>
      <div class="account-card-actions">
        <button class="btn-green host-test-btn" :disabled="testing" @click.stop="$emit('test', host.id)">
          {{ testing ? 'Testing…' : 'Test connection' }}
        </button>
        <button
          class="account-row-del"
          data-tooltip="Remove host"
          @click.stop="$emit('remove-host', host.id)"
          v-html="trashSvg"
        ></button>
      </div>
    </div>

    <div v-if="result" class="host-test-result" :class="{ 'host-test-result--ok': result.ok, 'host-test-result--fail': !result.ok }">
      <div class="host-test-message">{{ result.message }}</div>
      <code v-if="!result.ok && result.command" class="host-test-cmd">{{ result.command }}</code>
    </div>

    <div class="project-sessions">
      <RemoteAccountItem
        v-for="acc in host.accounts"
        :key="acc.id"
        :account="acc"
        @remove="(a) => $emit('remove-account', host.id, a.id)"
      />

      <div class="accounts-add-form host-add-account-form">
        <input
          v-model="accName"
          placeholder="Account name (e.g. Work)"
          @keydown.enter="addAccount"
        />
        <input
          v-model="accConfigDir"
          placeholder="configDir (e.g. ~/.claude-work)"
          @keydown.enter="addAccount"
        />
        <div class="text-center">
          <button class="btn-green" @click="addAccount">Add account</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// One Remote Host card: its name, its sshTarget, a Reachable / Unreachable badge, a Test
// connection button, the last diagnostic, its Accounts, and the add-account form. Dumb: it owns
// only the two draft inputs for a new Account and emits test / remove-host / add-account /
// remove-account; the reachability, the busy flag and the result are handed in.
import { ref, computed } from 'vue';
import RemoteAccountItem from './RemoteAccountItem.vue';
import { hostsIcons } from '../../../shared/lib/icons.js';

const { trashSvg } = hostsIcons;

const props = defineProps({
  host: { type: Object, required: true },
  // true (Reachable) | false (Unreachable) | undefined (not yet probed). Deliberately untyped:
  // a Boolean prop would be coerced to false when absent, collapsing the Checking state.
  reachable: { default: undefined },
  testing: { type: Boolean, default: false },
  result: { type: Object, default: null },
});

const emit = defineEmits(['test', 'remove-host', 'add-account', 'remove-account']);

const badgeLabel = computed(() => {
  if (props.reachable === undefined) return 'Checking…';
  return props.reachable ? 'Reachable' : 'Unreachable';
});
const badgeClass = computed(() => {
  if (props.reachable === undefined) return 'host-badge--checking';
  return props.reachable ? 'host-badge--reachable' : 'host-badge--unreachable';
});

const accName = ref('');
const accConfigDir = ref('');

function addAccount() {
  const name = accName.value.trim();
  const configDir = accConfigDir.value.trim();
  if (!name || !configDir) return;
  emit('add-account', props.host.id, { name, configDir }, () => {
    accName.value = '';
    accConfigDir.value = '';
  });
}
</script>
