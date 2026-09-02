<template>
  <SbIconButton class="session-launch-config-btn" tooltip="Resume with config" @click.stop="$emit('launch-config')">
    <SessionLaunchConfigIcon />
  </SbIconButton>
</template>

<script setup>
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionLaunchConfigIcon from '../../icons/SessionLaunchConfigIcon.vue';
defineEmits(['launch-config']);
</script>
