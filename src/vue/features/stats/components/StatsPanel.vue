<template>
  <div id="stats-viewer-body">
    <!-- Empty state -->
    <div v-if="!hasStats && !hasUsage" class="plans-empty">
      No stats data found. Run some Claude sessions first.
    </div>

    <template v-else>
      <!-- Heatmap -->
      <div v-if="hasStats" class="heatmap-container">
        <div class="heatmap-month-labels" style="position:relative;height:16px;">
          <span
            v-for="ml in monthLabels"
            :key="ml.key"
            class="heatmap-month-label"
            style="position:absolute;"
            :style="{ left: ml.left }"
          >{{ ml.label }}</span>
        </div>
        <div class="heatmap-grid-wrapper">
          <div class="heatmap-day-labels">
            <div v-for="name in dayNames" :key="name + Math.random()" class="heatmap-day-label">{{ name }}</div>
          </div>
          <div class="heatmap-grid">
            <div
              v-for="cell in heatmapCells"
              :key="cell.dateStr"
              :class="['heatmap-cell', 'heatmap-level-' + cell.level]"
              :title="cell.title"
            ></div>
          </div>
        </div>
        <div class="heatmap-legend">
          <span class="heatmap-legend-label">Less</span>
          <div v-for="i in [0,1,2,3,4]" :key="i" :class="['heatmap-legend-cell', 'heatmap-level-' + i]"></div>
          <span class="heatmap-legend-label">More</span>
        </div>
      </div>

      <!-- Daily bar chart -->
      <div v-if="hasStats" class="daily-chart-container">
        <div class="daily-chart-title">Last 30 days</div>
        <div class="daily-chart">
          <div
            v-for="col in dailyChartCols"
            :key="col.dateStr"
            class="daily-chart-col"
            :title="col.tooltip"
          >
            <div class="daily-chart-bar" :style="{ height: col.tokenPct + '%' }"></div>
            <div class="daily-chart-bar-msgs" :style="{ height: col.msgPct + '%' }"></div>
            <div class="daily-chart-label">{{ col.dayNum }}</div>
          </div>
        </div>
        <div class="daily-chart-legend">
          <span class="daily-chart-legend-dot tokens"></span> Tokens
          <span class="daily-chart-legend-dot msgs"></span> Messages
        </div>
      </div>

      <!-- Stats summary cards -->
      <div v-if="hasStats" class="stats-summary">
        <div v-for="card in summaryCards" :key="card.label" class="stat-card">
          <span class="stat-card-value">{{ card.value }}</span>
          <span class="stat-card-label">{{ card.label }}</span>
        </div>
      </div>

      <!-- Usage / rate limits -->
      <div v-if="hasUsage" class="usage-container">
        <div class="usage-title-row">
          <div class="daily-chart-title">Rate Limits</div>
          <button
            class="usage-refresh-btn"
            :class="{ 'usage-refresh-spinning': usageRefreshing }"
            :disabled="usageRefreshing"
            title="Refresh usage"
            @click="$emit('refresh-usage')"
            v-html="REFRESH_SVG"
          ></button>
        </div>
        <div v-if="usage._rateLimited" class="usage-rate-limited">
          {{ rateLimitedText }}
        </div>
        <div v-else class="usage-grid">
          <div
            v-for="item in usageCards"
            :key="item.key"
            class="usage-card"
          >
            <div class="usage-card-header">
              <span class="usage-card-label">{{ item.label }}</span>
              <span class="usage-card-pct">{{ item.pct }}%</span>
            </div>
            <div class="usage-track">
              <div
                :class="['usage-fill', item.pct >= 80 ? 'usage-fill-high' : '']"
                :style="{ width: Math.max(item.pct, 1) + '%' }"
              ></div>
            </div>
            <div v-if="item.reset" class="usage-card-reset">Resets {{ item.reset }}</div>
          </div>
        </div>
      </div>

      <!-- Stats notice footer -->
      <div v-if="hasStats" class="stats-notice" v-html="statsNoticeHtml"></div>
    </template>
  </div>
</template>

<script setup>
// Dumb: props in, one event out. No store, no service, no global window access.
defineProps({
  hasStats: { type: Boolean, default: false },
  hasUsage: { type: Boolean, default: false },
  monthLabels: { type: Array, default: () => [] },
  dayNames: { type: Array, default: () => [] },
  heatmapCells: { type: Array, default: () => [] },
  dailyChartCols: { type: Array, default: () => [] },
  summaryCards: { type: Array, default: () => [] },
  usage: { type: Object, default: () => ({}) },
  usageRefreshing: { type: Boolean, default: false },
  usageCards: { type: Array, default: () => [] },
  rateLimitedText: { type: String, default: '' },
  statsNoticeHtml: { type: String, default: '' },
});
defineEmits(['refresh-usage']);

const REFRESH_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>';
</script>
