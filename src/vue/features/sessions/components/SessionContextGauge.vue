<template>
  <!-- Empty until there is a usage to show. At full density the slot keeps its width so the
       gauge's arrival on the first assistant turn shifts nothing; compact collapses instead. -->
  <div class="session-context" :class="{ 'session-context--compact': compact }" :title="tooltip">
    <template v-if="hasGauge">
      <SbMeter
        class="session-context-meter"
        :value="total"
        :max="windowSize"
        :tick="tick"
        :severity="severity"
      />
      <span class="session-context-label">{{ label }}</span>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbMeter from '../../../shared/ui/SbMeter.vue';
import {
  windowFor, tickTokens, contextTotal, formatLabel, formatTokens, severityFor,
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
});

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
