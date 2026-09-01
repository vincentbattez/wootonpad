<template>
  <div class="project-group" :class="{ collapsed }">
    <div class="project-header" @click="toggle">
      <span class="arrow">&#9660;</span>
      <ProjectAvatar v-if="projectPath" class="project-header-avatar" :project-path="projectPath" />
      <span class="project-name">{{ label }}</span>
      <span class="memory-file-count">{{ files.length }}</span>
    </div>
    <div class="project-sessions">
      <ListItem
        v-for="file in files"
        :key="file.filePath"
        :title="file.filename"
        :subtitle="file.displayPath"
        :meta="fmtDate(file.modified)"
        :active="activeFile === file.filePath"
        :classes="['memory-item']"
        :item-id="'mf-' + file.filePath.replace(/[^a-zA-Z0-9]/g, '_')"
        @click="$emit('open', file)"
      >
        <template #leading>
          <span
            :class="isSchedule(file) ? 'memory-schedule-icon' : 'memory-brain-icon'"
            v-html="isSchedule(file) ? scheduleSvg : brainSvg"
          ></span>
        </template>
        <template #trailing>
          <button
            v-if="isSchedule(file)"
            class="schedule-play-btn"
            :class="{ running: runningFile === file.filePath, done: doneFile === file.filePath }"
            title="Run now"
            @click.stop="runSchedule(file)"
            v-html="playIcon(file)"
          ></button>
        </template>
      </ListItem>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { memoryIcons } from '../shared/lib/icons.js';
import { api } from '../shared/services/api.js';
import ListItem from './ListItem.vue';
import ProjectAvatar from './ProjectAvatar.vue';
const { brainSvg, scheduleSvg, playSvg, spinnerSvg, checkSvg } = memoryIcons;

const props = defineProps({
  groupKey: { type: String, required: true },
  label: { type: String, required: true },
  files: { type: Array, required: true },
  activeFile: { type: String, default: null },
  projectPath: { type: String, default: null },
});

const emit = defineEmits(['open']);

const collapsed = ref(false);

function toggle() { collapsed.value = !collapsed.value; }
function fmtDate(d) { return window.formatDate ? window.formatDate(new Date(d)) : d; }
function isSchedule(f) { return f.filename.startsWith('schedule-'); }

const runningFile = ref(null);
const doneFile = ref(null);

async function runSchedule(file) {
  runningFile.value = file.filePath;
  const result = await api.runScheduleNow(file.filePath);
  runningFile.value = null;
  doneFile.value = file.filePath;
  setTimeout(() => { doneFile.value = null; }, 2000);
  if (result && !result.ok) console.error('Schedule run failed:', result.error);
}

function playIcon(file) {
  if (runningFile.value === file.filePath) return spinnerSvg;
  if (doneFile.value === file.filePath) return checkSvg;
  return playSvg;
}

</script>
