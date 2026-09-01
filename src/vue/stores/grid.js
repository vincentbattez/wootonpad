import { reactive } from 'vue';

// The Session-overview grid, written through window.vueGrid. Each card keeps the
// DOM Teleport targets the vanilla grid renderer created.
export const gridStore = reactive({
  // sessionId → { headerEl, footerEl, name, project, initials, color, running, busy, time }
  cards: new Map(),
});
