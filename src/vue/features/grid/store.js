import { reactive } from 'vue';

// The grid Feature store. One slice: the Session-overview cards, keyed by sessionId. Each
// card keeps the header/footer DOM Teleport targets the frozen vanilla grid renderer built,
// plus the derived display fields it hands over. The feature's Bridge writes here; a Dumb
// Component reads it only through the Container.
export const gridStore = reactive({
  // sessionId → { headerEl, footerEl, name, project, initials, color, running, busy, time }
  cards: new Map(),
});
