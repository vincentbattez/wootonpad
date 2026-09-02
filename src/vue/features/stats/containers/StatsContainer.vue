<template>
  <StatsPanel
    :has-stats="!!statsStore.stats"
    :has-usage="hasUsage"
    :month-labels="monthLabels"
    :day-names="DAY_NAMES"
    :heatmap-cells="heatmapCells"
    :daily-chart-cols="dailyChartCols"
    :summary-cards="summaryCards"
    :usage="statsStore.usage"
    :usage-refreshing="usageRefreshing"
    :usage-cards="usageCards"
    :rate-limited-text="rateLimitedText"
    :stats-notice-html="statsNoticeHtml"
    @refresh-usage="onRefreshUsage"
  />
</template>

<script setup>
// The Stats Feature's edge Container: the only module importing the service. It
// watches the store's request counters (written by the Bridge), calls the service,
// and feeds the Dumb panel the pure module's view data.
import { ref, computed, watch } from 'vue';
import StatsPanel from '../components/StatsPanel.vue';
import { statsStore } from '../stats-store.js';
import { loadStats, refreshAllStats, refreshUsage, invalidateStats } from '../stats-service.js';
import {
  DAY_NAMES,
  buildMonthLabels,
  buildHeatmapCells,
  buildDailyChartCols,
  buildSummaryCards,
  buildUsageCards,
  buildRateLimitedText,
} from '../stats-compute.mjs';

const usageRefreshing = ref(false);

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

// ── View data (pure module fed by the store) ──────────────────────
const hasUsage = computed(() => statsStore.usage && Object.keys(statsStore.usage).length > 0);
const monthLabels = computed(() => statsStore.stats ? buildMonthLabels(startOfToday()) : []);
const heatmapCells = computed(() => statsStore.stats ? buildHeatmapCells(statsStore.stats, startOfToday()) : []);
const dailyChartCols = computed(() => statsStore.stats ? buildDailyChartCols(statsStore.stats, startOfToday()) : []);
const summaryCards = computed(() => statsStore.stats ? buildSummaryCards(statsStore.stats, startOfToday()) : []);
const usageCards = computed(() => buildUsageCards(statsStore.usage));
const rateLimitedText = computed(() => buildRateLimitedText(statsStore.usage));

const statsNoticeHtml = computed(() => {
  if (!statsStore.stats) return '';
  const lastDate = statsStore.stats.lastComputedDate || 'unknown';
  const escaped = window.escapeHtml ? window.escapeHtml(lastDate) : lastDate;
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align:-2px;margin-right:6px;flex-shrink:0"><circle cx="8" cy="8" r="7"/><line x1="8" y1="5" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/></svg>Data sourced from Claude’s stats cache (last updated ${escaped}).`;
});

// ── Store-driven loading ──────────────────────────────────────────
// Drop the cache first, so an invalidate+load pair in one flush reloads fresh.
watch(() => statsStore.invalidateRequest, () => { invalidateStats(); });
watch(() => statsStore.loadRequest, async () => {
  const { stats, usage } = await loadStats();
  statsStore.stats = stats;
  statsStore.usage = usage || {};
});

// ── Actions ───────────────────────────────────────────────────────
async function refreshAll() {
  if (statsStore.refreshing) return;
  statsStore.refreshing = true;
  try {
    const { stats, usage } = await refreshAllStats();
    if (stats) statsStore.stats = stats;
    if (usage) statsStore.usage = usage;
  } catch {}
  statsStore.refreshing = false;
}

async function onRefreshUsage() {
  usageRefreshing.value = true;
  try {
    statsStore.usage = await refreshUsage();
  } catch {}
  usageRefreshing.value = false;
}

// App.vue's header refresh button drives these.
const isRefreshing = computed(() => statsStore.refreshing);
defineExpose({ refreshAll, isRefreshing });
</script>
