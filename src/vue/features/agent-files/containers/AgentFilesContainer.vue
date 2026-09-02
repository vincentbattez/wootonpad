<template>
  <!-- The Plans panel, Teleported to its sidebar mount point. -->
  <Teleport to="#plans-content">
    <div>
      <div v-if="plans.length === 0" class="plans-empty">
        No plans found in ~/.claude/plans/
      </div>
      <AgentFileGroup
        v-else
        label="Plans"
        :files="planRows"
        @open="onOpenPlan"
      />
    </div>
  </Teleport>

  <!-- The Memory (Agent Files) tree, Teleported to its sidebar mount point. -->
  <Teleport to="#memory-content">
    <div>
      <div v-if="allFiles.length === 0" class="plans-empty">
        No memory files found.
      </div>
      <template v-else>
        <AgentFileGroup
          v-if="memory.global.files.length > 0"
          label="Global"
          :files="globalRows"
          :collapsible="true"
          :show-count="true"
          @open="onOpenMemory"
          @run="onRun"
        />
        <AgentFileProjectGroup
          v-for="proj in filteredProjects"
          :key="proj.folder"
          :label="proj.shortName"
          :project-path="proj.projectPath"
          :files="projectRows(proj)"
          @open="onOpenMemory"
          @run="onRun"
        />
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';
import { sb } from '../../../shared/services/sb.js';
import { api } from '../../../shared/services/api.js';
import { agentFilesStore } from '../store.js';
import { planRow, memoryRow } from '../rows.mjs';
import AgentFileGroup from '../components/AgentFileGroup.vue';
import AgentFileProjectGroup from './AgentFileProjectGroup.vue';

// The agent-files Feature's one edge Container — the only agent-files component that imports the
// service layer and reads the feature store. It reads the two panel slices the Bridge writes,
// maps each Plan and memory file to the shared row model, turns each row's `open`/`run` back into
// a service call, and owns the run-now busy state the Dumb rows must not.

const fmtDate = (d) => (typeof window !== 'undefined' && window.formatDate ? window.formatDate(new Date(d)) : d);

// ── Plans ─────────────────────────────────────────────────────────
const plans = computed(() => agentFilesStore.plans);
const planRows = computed(() =>
  plans.value.map((plan) => planRow(plan, { activePlan: agentFilesStore.activePlan, fmtDate })),
);

function onOpenPlan(filename) {
  agentFilesStore.activePlan = filename;
  const plan = plans.value.find((p) => p.filename === filename);
  if (plan) sb.openPlan?.(plan);
}

// ── Memory ────────────────────────────────────────────────────────
const memory = computed(() => agentFilesStore.memory);
const filterIds = computed(() => agentFilesStore.memoryFilterIds);
const activeFile = computed(() => agentFilesStore.activeMemoryFile);

// The run-now busy state: the file being run, and the one that just finished (a check for 2s).
const runningFile = ref(null);
const doneFile = ref(null);

const allFiles = computed(() =>
  [...memory.value.global.files, ...memory.value.projects.flatMap((p) => p.files)],
);

const filteredGlobal = computed(() => {
  if (!filterIds.value) return memory.value.global.files;
  return memory.value.global.files.filter((f) => filterIds.value.has(f.filePath));
});

const filteredProjects = computed(() =>
  memory.value.projects
    .map((proj) => ({
      ...proj,
      files: filterIds.value ? proj.files.filter((f) => filterIds.value.has(f.filePath)) : proj.files,
    }))
    .filter((proj) => proj.files.length > 0),
);

function toRow(file) {
  return memoryRow(file, {
    activeFile: activeFile.value,
    runningFile: runningFile.value,
    doneFile: doneFile.value,
    fmtDate,
  });
}

const globalRows = computed(() => filteredGlobal.value.map(toRow));
function projectRows(proj) {
  return proj.files.map(toRow);
}

function onOpenMemory(filePath) {
  agentFilesStore.activeMemoryFile = filePath;
  const file = allFiles.value.find((f) => f.filePath === filePath);
  if (file) sb.openMemory?.(file);
}

async function onRun(filePath) {
  runningFile.value = filePath;
  const result = await api.runScheduleNow?.(filePath);
  runningFile.value = null;
  doneFile.value = filePath;
  setTimeout(() => { doneFile.value = null; }, 2000);
  if (result && !result.ok) console.error('Schedule run failed:', result.error);
}
</script>
