<template>
  <GridCard
    v-for="card in cards"
    :key="card.sessionId"
    :header-el="card.headerEl"
    :footer-el="card.footerEl"
    :name="card.name"
    :project="card.project"
    :initials="card.initials"
    :color="card.color"
    :running="card.running"
    :busy="card.busy"
    :time="card.time"
    @stop="$emit('stop', card.sessionId)"
  />
</template>

<script setup>
// Renders the run of Session-overview cards. The list and the card are always two components,
// mirroring the sessions Feature's list/item split. It owns no data: it takes the cards it is
// handed and forwards each card's stop event untouched, tagged with the Session it came from.
import GridCard from './GridCard.vue';

defineProps({
  cards: { type: Array, required: true },
});

defineEmits(['stop']);
</script>
