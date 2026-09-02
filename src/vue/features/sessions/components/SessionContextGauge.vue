<template>
  <!-- The slot always reserves its width so the gauge's arrival on the first assistant
       turn never shifts the header. Empty until there is a usage to show. -->
  <div class="vsh-context" :title="tooltip">
    <template v-if="hasGauge">
      <SbMeter
        class="vsh-context-meter"
        :value="total"
        :max="windowSize"
        :tick="tick"
        :severity="severity"
      />
      <span class="vsh-context-label">{{ label }}</span>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbMeter from '../../../shared/ui/SbMeter.vue';
import {
  windowFor, tickTokens, contextTotal, formatLabel, severityFor,
} from '../context-gauge.mjs';

// The resting context gauge for the terminal header. Dumb: it takes the last assistant
// turn's usage breakdown and its model, and derives everything else from the pure
// context-gauge module — the denominator, the autocompact tick, the danger flip and the
// abbreviated label. No usage means no gauge (a zero bar would lie about a context already
// holding the system prompt, tools and memory files).
const props = defineProps({
  usage: { type: Object, default: null },
  model: { type: String, default: null },
});

const hasGauge = computed(() => props.usage != null);
const total = computed(() => contextTotal(props.usage));
const windowSize = computed(() => windowFor(props.model));
const tick = computed(() => tickTokens(props.model));
const severity = computed(() => severityFor(total.value, props.model));
const label = computed(() => formatLabel(total.value, windowSize.value));

// The hover tooltip decomposes the four counters and names the model and window, so the
// denominator is verifiable. Raw numbers, grouped, since this is the exact view.
const tooltip = computed(() => {
  if (!hasGauge.value) return '';
  const u = props.usage;
  const n = (x) => (x || 0).toLocaleString();
  return [
    'Context ' + label.value,
    'Model: ' + (props.model || 'unknown'),
    'Cache read: ' + n(u.cacheReadTokens),
    'Cache creation: ' + n(u.cacheCreationTokens),
    'Input: ' + n(u.inputTokens),
    'Output: ' + n(u.outputTokens),
  ].join('\n');
});
</script>
