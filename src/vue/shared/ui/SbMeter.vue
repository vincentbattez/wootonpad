<template>
  <div class="sb-meter">
    <div
      class="sb-meter-fill"
      :class="severity || null"
      :style="{ width: fillWidth }"
    ></div>
    <div
      v-if="tick != null"
      class="sb-meter-tick"
      :style="{ left: tickLeft }"
    ></div>
  </div>
</template>

<script setup>
// One progress-bar grammar for the whole Vue layer: a track and a fill. The Primitive knows
// no threshold — it is handed a value, a max and a severity state the caller has already
// computed, so the accounts panel (warn/danger at 70/90) shares it without its rule leaking
// in here. The severity string becomes the fill's modifier class, so the stylesheet's token
// layer owns every colour. Dumb: props in, no store, no service, no window.
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, required: true },
  max: { type: Number, default: 100 },
  // '' | 'warn' | 'danger' — a caller-computed state, never a threshold.
  severity: { type: String, default: '' },
  // An optional marker on the track, in value units (the context gauge's autocompact line).
  // null hides it; the accounts bar leaves it null.
  tick: { type: Number, default: null },
});

const clampPct = (n) => Math.min(Math.max(n, 0), 100);
const fillWidth = computed(() => clampPct((props.value / props.max) * 100) + '%');
const tickLeft = computed(() => clampPct((props.tick / props.max) * 100) + '%');
</script>
