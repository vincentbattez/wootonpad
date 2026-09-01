<template>
  <SbIconButton class="session-jsonl-btn" tooltip="View messages" @click.stop="$emit('jsonl')">
    <SessionMessagesIcon />
  </SbIconButton>
</template>

<script setup>
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionMessagesIcon from '../../icons/SessionMessagesIcon.vue';
defineEmits(['jsonl']);
</script>
