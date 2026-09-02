<template>
  <button type="button" :data-tooltip="tooltip || null"><slot /></button>
</template>

<script setup>
// A bare icon button: the icon goes in the default slot, the CSS class is passed through
// by attribute fallthrough, and the tooltip is the `data-tooltip` the global stylesheet
// handles. It adds no class of its own and no behaviour, so the split off a raw <button>
// is a DOM-level no-op. It exists as the attachment point for the later CSS pass; the
// click listener falls through to the <button> from the parent. `type="button"` is
// explicit so an icon button inside a <form> never submits it.
defineProps({
  tooltip: { type: String, default: '' },
});
</script>
