<template>
  <SbIconButton
    class="session-done-btn"
    :class="{ 'is-done': done }"
    :tooltip="done ? 'Reopen session' : 'Mark done'"
    @click.stop="$emit('done')"
  >
    <SessionDoneIcon :filled="done" />
  </SbIconButton>
</template>

<script setup>
// Closing the subject, in one click, from the row — the primary way `done` is declared
// (ADR 0015). Not Stop: that kills the PTY, this says the work is finished.
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionDoneIcon from '../../icons/SessionDoneIcon.vue';
defineProps({
  done: { type: Boolean, default: false },
});
defineEmits(['done']);
</script>
