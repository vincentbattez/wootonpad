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
// One progress-bar grammar for the whole Vue layer: a track, a fill, and an optional tick.
// The Primitive knows no threshold — it is handed a value, a max and a severity state the
// caller has already computed, so the accounts panel (warn/danger at 70/90) and the session
// context gauge (a single accent, flipped past the tick) share it without either rule leaking
// in here. The severity string becomes the fill's modifier class, so the stylesheet's token
// layer owns every colour. The tick, in the same units as the value, is optional and unused
// by the accounts panel. Dumb: props in, no store, no service, no window.
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, required: true },
  max: { type: Number, default: 100 },
  // '' | 'warn' | 'danger' — a caller-computed state, never a threshold.
  severity: { type: String, default: '' },
  // Optional marker position, in the same units as `value`; null hides it.
  tick: { type: Number, default: null },
});

const pctOf = (n) => Math.min(Math.max((n / props.max) * 100, 0), 100) + '%';
const fillWidth = computed(() => pctOf(props.value));
const tickLeft = computed(() => pctOf(props.tick));
</script>
