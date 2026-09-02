<template>
  <!-- A compact row is an archive entry: unarchive is its only sensible action. -->
  <div v-if="compact" class="session-actions">
    <SessionArchiveButton :archived="true" @archive="$emit('archive')" />
  </div>

  <div v-else class="session-actions">
    <SessionStopButton @stop="$emit('stop')" />
    <template v-if="!isTerminalLike">
      <SessionForkButton @fork="$emit('fork')" />
      <SessionMessagesButton @jsonl="$emit('jsonl')" />
      <SessionArchiveButton :archived="archived" @archive="$emit('archive')" />
      <SessionLaunchConfigButton @launch-config="$emit('launch-config')" />
    </template>
    <SessionPinButton :starred="starred" @star="$emit('star')" />
  </div>
</template>

<script setup>
// Assembles the six Session actions into the row's action cluster. Which appear depends on
// the row: an archive entry (compact) offers only unarchive; a terminal-like Session has no
// .jsonl behind it, so fork, messages, archive and launch-config drop out, leaving stop and
// pin. Each button is its own component; this only arranges them and forwards their events.
import SessionStopButton from './actions/SessionStopButton.vue';
import SessionForkButton from './actions/SessionForkButton.vue';
import SessionMessagesButton from './actions/SessionMessagesButton.vue';
import SessionArchiveButton from './actions/SessionArchiveButton.vue';
import SessionLaunchConfigButton from './actions/SessionLaunchConfigButton.vue';
import SessionPinButton from './actions/SessionPinButton.vue';

defineProps({
  compact: { type: Boolean, default: false },
  isTerminalLike: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  starred: { type: Boolean, default: false },
});

defineEmits(['stop', 'fork', 'jsonl', 'archive', 'launch-config', 'star']);
</script>
