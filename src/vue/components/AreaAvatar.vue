<template>
  <img v-if="dataUrl" v-bind="$attrs" :src="dataUrl" :alt="props.name" style="object-fit:cover;display:inline-block;">
  <span v-else v-bind="$attrs" :style="{ background: fallback.color }">{{ fallback.initials }}</span>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { api } from '../shared/services/api.js';
import { store } from '../store.js';
import { avatarFromName } from '../avatar.mjs';

// The Project avatar generalised to an Area: a stored image (data URL, fetched once and cached in
// the store) with an initials-and-colour fallback derived from the Area's free-form name (VIN-82).
defineOptions({ inheritAttrs: false });

const props = defineProps({
  areaId: { type: String, required: true },
  name: { type: String, default: '' },
});

const dataUrl = computed(() => store.areaAvatarDataUrls[props.areaId] || null);
const fallback = computed(() => avatarFromName(props.name));

async function load() {
  if (dataUrl.value || !props.areaId || !api.getAreaAvatar) return;
  const url = await api.getAreaAvatar(props.areaId).catch(() => null);
  if (url) store.areaAvatarDataUrls[props.areaId] = url;
}

onMounted(load);
watch(() => props.areaId, load);
</script>
