<template>
  <!-- Three states (context-gauge.mjs gaugeState): the gauge once a usage is known; the empty
       "measuring" track for a working Session with no value yet — it keeps the meter's width so
       the first value's arrival shifts nothing; and nothing at all for a resting Session. -->
  <div
    v-if="state !== 'none'"
    class="session-context"
    :class="{ 'session-context--compact': compact }"
    :title="tooltip"
  >
    <template v-if="state === 'gauge'">
      <SbMeter
        class="session-context-meter"
        :value="total"
        :max="windowSize"
        :tick="tick"
        :severity="severity"
      />
      <span class="session-context-label">{{ label }}</span>
    </template>
    <SbMeter
      v-else
      class="session-context-meter session-context-meter--empty"
      :value="0"
      :max="windowSize"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbMeter from '../../../shared/ui/SbMeter.vue';
import {
  windowFor, tickTokens, contextTotal, formatLabel, formatTokens, severityFor, gaugeState,
} from '../context-gauge.mjs';

// The resting context gauge for a Session row. Dumb: it takes the last assistant
// turn's usage breakdown and its model, and derives everything else from the pure
// context-gauge module — the denominator, the autocompact tick, the colour tier and the
// abbreviated label. No usage means no gauge (a zero bar would lie about a context already
// holding the system prompt, tools and memory files).
const props = defineProps({
  usage: { type: Object, default: null },
  model: { type: String, default: null },
  // The sidebar row's density: a narrower track and the used tokens alone, the window
  // being one hover away in the tooltip.
  compact: { type: Boolean, default: false },
  // Whether the Session is working. A working Session with no value yet shows the empty
  // measuring track; a resting one with no value shows nothing (VIN-149).
  working: { type: Boolean, default: false },
});

const state = computed(() => gaugeState(props.usage, props.working));
const hasGauge = computed(() => props.usage != null);
const total = computed(() => contextTotal(props.usage));
const windowSize = computed(() => windowFor(props.model));
const tick = computed(() => tickTokens(props.model));
const severity = computed(() => severityFor(total.value));
const label = computed(() => (props.compact
  ? formatTokens(total.value)
  : formatLabel(total.value, windowSize.value)));

// The hover tooltip decomposes the four counters and names the model and window, so the
// denominator is verifiable. Raw numbers, grouped, since this is the exact view.
const tooltip = computed(() => {
  if (!hasGauge.value) return '';
  const u = props.usage;
  const n = (x) => (x || 0).toLocaleString();
  return [
    'Context ' + formatLabel(total.value, windowSize.value),
    'Model: ' + (props.model || 'unknown'),
    'Cache read: ' + n(u.cacheReadTokens),
    'Cache creation: ' + n(u.cacheCreationTokens),
    'Input: ' + n(u.inputTokens),
    'Output: ' + n(u.outputTokens),
  ].join('\n');
});
</script>
