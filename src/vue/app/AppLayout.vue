<template>
  <!-- ── SIDEBAR ────────────────────────────────────────────────── -->
  <div id="sidebar" :class="{ collapsed }">
    <slot name="sidebar" />
  </div>

  <!-- ── RESIZE HANDLE ──────────────────────────────────────────── -->
  <div id="sidebar-resize-handle"></div>

  <!-- ── MAIN AREA ──────────────────────────────────────────────── -->
  <div id="main">
    <slot name="main" />
  </div>

  <!-- Status bar, grid cards and dialogs teleport themselves into place -->
  <slot name="status" />
</template>

<script setup>
// The Dumb app layout: three slots — the sidebar column, the main surface and the
// status/overlay layer — and one prop for the sidebar's collapsed state. It imports
// nothing but Vue: the top of the tree obeys the same rule as the bottom, so the
// shell is a shape anyone can render with fixed inputs (ADR 0009).
defineProps({
  collapsed: { type: Boolean, default: false },
});
</script>
