<template>
  <SbIconButton class="session-archive-btn" :tooltip="archived ? 'Unarchive' : 'Archive'" @click.stop="$emit('archive')">
    <SessionArchiveIcon />
  </SbIconButton>
</template>

<script setup>
import SbIconButton from '../../../../shared/ui/SbIconButton.vue';
import SessionArchiveIcon from '../../icons/SessionArchiveIcon.vue';
defineProps({
  archived: { type: Boolean, default: false },
});
defineEmits(['archive']);
</script>
