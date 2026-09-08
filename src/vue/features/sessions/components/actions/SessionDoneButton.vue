<template>
  <SbIconButton
    class="session-done-btn"
    :class="{ done }"
    :tooltip="done ? 'Mark as not done' : 'Mark as done'"
    @click.stop="$emit('done')"
  >
    <SessionDoneIcon :filled="done" />
  </SbIconButton>
</template>

<script setup>
// The human's path to the Session State `done` flag, at the same level as Pin and Archive
// (ADR 0015). Marking done never archives — finished and filed away are two decisions. This
// is not Stop: the Stop button kills the PTY, this closes the subject.
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionDoneIcon from '../../icons/SessionDoneIcon.vue';
defineProps({
  done: { type: Boolean, default: false },
});
defineEmits(['done']);
</script>
