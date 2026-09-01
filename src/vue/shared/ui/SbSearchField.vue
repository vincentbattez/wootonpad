<template>
  <!-- The search field Primitive: an input with a clear button and a titles-only toggle.
       It owns no query state — it renders `query` and emits every edit, so a Container can
       debounce and drive the actual search. Dumb: no store, no service, no window. -->
  <div id="search-bar" :class="{ 'has-query': query }">
    <input
      id="search-input"
      type="text"
      :placeholder="placeholder"
      :value="query"
      @input="$emit('update', $event.target.value)"
    />
    <button id="search-clear" type="button" aria-label="Clear search" @click="$emit('clear')">&times;</button>
    <button
      id="search-titles-toggle"
      type="button"
      :class="{ active: titlesOnly }"
      data-tooltip="Search titles only"
      aria-label="Search titles only"
      @click="$emit('toggle-titles')"
    >Tt</button>
  </div>
</template>

<script setup>
defineProps({
  query: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  titlesOnly: { type: Boolean, default: false },
});
defineEmits(['update', 'clear', 'toggle-titles']);
</script>
