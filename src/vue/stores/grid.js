import { reactive } from 'vue';

// The Session-overview grid. A standalone feature store: app.js pushes cards
// through the grid bridge (window.vueGrid) and GridCardsApp teleports each card
// into its header/footer element. The card values keep the DOM Teleport targets
// (headerEl/footerEl) the vanilla grid renderer created. Not part of the
// window.vueStore aggregate.
export const gridStore = reactive({
  // sessionId → { headerEl, footerEl, name, project, initials, color, running, busy, time }
  cards: new Map(),
});
