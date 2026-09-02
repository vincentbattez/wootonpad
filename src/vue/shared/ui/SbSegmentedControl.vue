<template>
  <!-- A segmented control Primitive: a row of mutually-exclusive buttons, one selected.
       It renders a bare button per segment (no wrapper of its own, so the caller places
       them inside whatever container the layout needs) and emits the picked value. The
       caller owns every class name and per-button attribute — a Primitive invents none.
       `segment.html` fills a button whose whole content is raw markup (an icon); otherwise
       the `segment` slot renders it. Dumb: no store, no service, no window. -->
  <template v-for="segment in segments" :key="segment.value">
    <button
      v-if="segment.html !== undefined"
      :class="[itemClass, { [activeClass]: segment.value === modelValue }]"
      v-bind="segment.attrs || {}"
      @click="$emit('update:modelValue', segment.value)"
      v-html="segment.html"
    ></button>
    <button
      v-else
      :class="[itemClass, { [activeClass]: segment.value === modelValue }]"
      v-bind="segment.attrs || {}"
      @click="$emit('update:modelValue', segment.value)"
    >
      <slot name="segment" :segment="segment" :active="segment.value === modelValue">{{ segment.label }}</slot>
    </button>
  </template>
</template>

<script setup>
defineProps({
  // Each segment: { value, label?, html?, attrs? }.
  segments: { type: Array, required: true },
  modelValue: { default: null },
  itemClass: { type: [String, Array, Object], default: '' },
  activeClass: { type: String, default: 'active' },
});
defineEmits(['update:modelValue']);
</script>
