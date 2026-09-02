<template>
  <SbIconButton class="session-stop-btn" tooltip="Stop session" @click.stop="$emit('stop')">
    <SessionStopIcon />
  </SbIconButton>
</template>

<script setup>
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionStopIcon from '../../icons/SessionStopIcon.vue';
defineEmits(['stop']);
</script>
