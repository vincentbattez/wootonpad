<template>
  <div>
    <div v-if="plans.length === 0" class="plans-empty">
      No plans found in ~/.claude/plans/
    </div>

    <div v-else class="project-group">
      <div class="project-header">
        <span class="project-name">Plans</span>
      </div>
      <div class="project-sessions">
        <ListItem
          v-for="plan in plans"
          :key="plan.filename"
          :title="plan.title || plan.filename"
          :subtitle="plan.filename"
          :meta="fmtDate(plan.modified)"
          :active="activePlan === plan.filename"
          :classes="['plan-item']"
          @click="openPlan(plan)"
        >
          <template #leading>
            <span class="memory-brain-icon" v-html="planSvg"></span>
          </template>
        </ListItem>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { plansIcons } from '../shared/lib/icons.js';
import ListItem from './ListItem.vue';
import { plansStore } from '../stores/plans.js';
const { planSvg } = plansIcons;

const props = defineProps({
  callbacks: { type: Object, required: true },
});

// Read the feature store the plans bridge writes; no local copy, no setter.
const plans = computed(() => plansStore.plans);
const activePlan = computed(() => plansStore.activePlan);

function fmtDate(d) {
  return window.formatDate ? window.formatDate(new Date(d)) : d;
}

function openPlan(plan) {
  plansStore.activePlan = plan.filename;
  props.callbacks.openPlan?.(plan);
}

</script>
