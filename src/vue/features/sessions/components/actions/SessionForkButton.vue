<template>
  <SbIconButton class="session-fork-btn" tooltip="Fork session" @click.stop="$emit('fork')">
    <SessionForkIcon />
  </SbIconButton>
</template>

<script setup>
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionForkIcon from '../../icons/SessionForkIcon.vue';
defineEmits(['fork']);
</script>
