<template>
  <!-- A compact row is an archive entry: unarchive is its only sensible action. -->
  <div v-if="compact" class="session-actions">
    <SessionArchiveButton :archived="true" @archive="$emit('archive')" />
  </div>

  <div v-else class="session-actions">
    <SessionStopButton @stop="$emit('stop')" />
    <SessionDoneButton :done="done" @done="$emit('done')" />
    <SessionForkButton @fork="$emit('fork')" />
    <SessionMessagesButton @jsonl="$emit('jsonl')" />
    <SessionArchiveButton :archived="archived" @archive="$emit('archive')" />
    <SessionLaunchConfigButton @launch-config="$emit('launch-config')" />
    <SessionPinButton :starred="starred" @star="$emit('star')" />
  </div>
</template>

<script setup>
// Assembles the Session actions into the row's action cluster. Which appear depends on the
// row: an archive entry (compact) offers only unarchive. A Terminal never comes through here
// — it has its own row and its own two actions. Each button is its own component; this only
// arranges them and forwards their events.
import SessionStopButton from './actions/SessionStopButton.vue';
import SessionDoneButton from './actions/SessionDoneButton.vue';
import SessionForkButton from './actions/SessionForkButton.vue';
import SessionMessagesButton from './actions/SessionMessagesButton.vue';
import SessionArchiveButton from './actions/SessionArchiveButton.vue';
import SessionLaunchConfigButton from './actions/SessionLaunchConfigButton.vue';
import SessionPinButton from './actions/SessionPinButton.vue';

defineProps({
  compact: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  starred: { type: Boolean, default: false },
  done: { type: Boolean, default: false },
});

defineEmits(['stop', 'fork', 'jsonl', 'archive', 'launch-config', 'star', 'done']);
</script>
