<template>
  <img v-if="dataUrl" v-bind="$attrs" :src="dataUrl" :alt="name" style="object-fit:cover;display:inline-block;">
  <span v-else v-bind="$attrs" :style="{ background: fallback.color }">{{ fallback.initials }}</span>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { store } from '../store.js';
import { avatarFromPath } from '../avatar.mjs';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  projectPath: { type: String, required: true },
});

const name = computed(() => props.projectPath.split('/').filter(Boolean).pop() || '');
const dataUrl = computed(() => store.avatarDataUrls[props.projectPath] || null);
const fallback = computed(() => avatarFromPath(props.projectPath));

onMounted(async () => {
  if (dataUrl.value || !props.projectPath || !window.api?.getProjectAvatar) return;
  const url = await window.api.getProjectAvatar(props.projectPath).catch(() => null);
  if (url) store.avatarDataUrls[props.projectPath] = url;
});
</script>
