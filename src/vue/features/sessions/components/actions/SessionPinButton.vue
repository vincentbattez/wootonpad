<template>
  <span class="session-pin" :class="{ pinned: starred }" @click.stop="$emit('star')">
    <SessionPinIcon :filled="starred" />
  </span>
</template>

<script setup>
import SessionPinIcon from '../../icons/SessionPinIcon.vue';
defineProps({
  starred: { type: Boolean, default: false },
});
defineEmits(['star']);
</script>
