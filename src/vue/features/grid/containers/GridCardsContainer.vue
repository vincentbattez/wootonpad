<template>
  <GridCardList :cards="cards" @stop="onStop" />
</template>

<script setup>
import { computed } from 'vue';
import { sb } from '../../../shared/services/sb.js';
import { gridStore } from '../store.js';
import GridCardList from '../components/GridCardList.vue';

// The grid Feature's edge Container. It is the one grid component that reads the feature store
// and the service layer: it flattens the card map into the list's ordered array and turns a
// card's stop back into a service call. sb.stopSession is the frozen renderer's
// confirm-and-stop path, so the confirmation dialog is preserved.
const cards = computed(() =>
  [...gridStore.cards.entries()].map(([sessionId, card]) => ({ sessionId, ...card }))
);

function onStop(sessionId) {
  sb.stopSession?.(sessionId);
}
</script>
