// The grid Feature's Bridge to the frozen legacy renderer. `public/grid-view.js` builds a
// card's header/footer DOM and calls window.vueGrid.addCard/updateCard/removeCard/clearAll;
// those names and signatures are the contract, so they stay put while the write lands in the
// feature store rather than a component ref. That is what lets the grid card be a Dumb
// Component. Composed into window.vueGrid in main.js.
export function createGridBridge(store) {
  return {
    addCard(sessionId, headerEl, footerEl, { name, project, initials, color, running, busy, time }) {
      store.cards.set(sessionId, { headerEl, footerEl, name, project, initials, color, running: !!running, busy: !!busy, time: time || '' });
    },
    updateCard(sessionId, running, busy, time) {
      const card = store.cards.get(sessionId);
      if (!card) return;
      card.running = !!running;
      card.busy = !!busy;
      if (time !== undefined) card.time = time;
    },
    removeCard(sessionId) { store.cards.delete(sessionId); },
    clearAll() { store.cards.clear(); },
  };
}
