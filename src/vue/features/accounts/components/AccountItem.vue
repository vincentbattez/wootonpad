<template>
  <div
    class="session-item account-item"
    :class="{ active: isActive }"
    @click="!renaming && $emit('switch', account)"
  >
    <div class="session-row">
      <div class="account-name-row">
        <SbEditableLabel
          :editing="renaming"
          :value="renameValue"
          input-class="account-row-name-input"
          @submit="submit"
          @cancel="cancel"
        ><div class="session-summary" @dblclick.stop="startRename">{{ account.name }}</div></SbEditableLabel>
        <div class="account-card-actions">
          <button
            v-if="!renaming"
            class="account-edit-btn"
            data-tooltip="Rename"
            @click.stop="startRename"
            v-html="editSvg"
          ></button>
          <button
            class="account-open-btn"
            data-tooltip="Open Claude session in home directory"
            @click.stop="$emit('open-claude', account)"
          >Open Claude</button>
          <button
            v-if="account.id !== 'default'"
            class="account-row-del"
            data-tooltip="Remove account"
            @click.stop="$emit('delete', account)"
            v-html="trashSvg"
          ></button>
        </div>
      </div>
      <div class="session-subtitle">{{ account.configDir || '~/.claude (default)' }}</div>
      <div v-if="hasUsage(usage)" class="account-usage-block">
        <div v-for="row in usageRows(usage)" :key="row.key" class="account-usage-row">
          <span class="account-usage-label">{{ row.label }}</span>
          <SbMeter
            class="account-usage-meter"
            :value="row.pct"
            :max="100"
            :severity="usageSeverity(row.pct)"
          />
          <span class="account-usage-info">{{ row.pct }}%{{ row.resetIn ? `  · resets in ${row.resetIn}~` : '' }}</span>
        </div>
        <div v-if="usage?._cached" class="account-usage-cached-note">cached data</div>
      </div>
    </div>
  </div>
</template>

<script setup>
// One account row in the Accounts panel. Dumb: it takes the account, its active flag and its
// usage entry, and emits switch / rename / open-claude / delete. Rename runs through the shared
// editable-label and inline-rename composable, and the usage read model is the pure usage module,
// so this file carries no store, no service and no window access. Class names are preserved
// verbatim from the pre-migration row.
import SbEditableLabel from '../../../shared/ui/SbEditableLabel.vue';
import SbMeter from '../../../shared/ui/SbMeter.vue';
import { useInlineRename } from '../../../shared/composables/use-inline-rename.js';
import { hasUsage, usageRows, usageSeverity } from '../usage.mjs';
import { accountsIcons } from '../../../shared/lib/icons.js';

const { editSvg, trashSvg } = accountsIcons;

const props = defineProps({
  account: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  usage: { type: Object, default: null },
});

const emit = defineEmits(['switch', 'rename', 'open-claude', 'delete']);

const { editing: renaming, draft: renameValue, start, submit, cancel } =
  useInlineRename((name) => emit('rename', props.account.id, name));

function startRename() {
  start(props.account.name || '');
}
</script>
