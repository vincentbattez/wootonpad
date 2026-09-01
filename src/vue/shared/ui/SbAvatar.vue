<template>
  <img
    v-if="dataUrl"
    v-bind="$attrs"
    :src="dataUrl"
    :alt="alt"
    style="object-fit:cover;display:inline-block;"
  />
  <span v-else v-bind="$attrs" :style="{ background: color }">{{ initials }}</span>
</template>

<script setup>
// The avatar primitive: a stored image when one is present, otherwise the initials-and-colour
// fallback. It holds no fetching or caching — the useAvatar composable owns that and hands the
// resolved data URL and fallback down — so a Dumb Component can render an avatar with fixed data.
defineOptions({ inheritAttrs: false });

defineProps({
  dataUrl: { type: String, default: null },
  alt: { type: String, default: '' },
  initials: { type: String, default: '' },
  color: { type: String, default: '' },
});
</script>
