// The agent-files Feature's Bridge to the frozen legacy renderer. Plans and memory keep their
// two separate globals — window.vuePlans and window.vueMemory — because public/app.js calls
// them by those names; this composes both from one Feature that owns their store. Every method
// writes the feature store rather than a component ref, so the panels reading it stay Dumb
// Components. The names and signatures are the frozen contract.
export function createAgentFilesBridge(store) {
  return {
    // window.vuePlans: the Plans list and which plan is open.
    plans: {
      setPlans(list) { store.plans = list; },
      setActive(filename) { store.activePlan = filename; },
      clearActive() { store.activePlan = null; },
    },

    // window.vueMemory: the Agent Files tree, the active-file highlight and the search filter.
    memory: {
      setMemories(data, ids = null) {
        store.memory = data;
        store.memoryFilterIds = ids;
      },
      setFilter(ids) { store.memoryFilterIds = ids; },
      setActive(filePath) { store.activeMemoryFile = filePath; },
      clearActive() { store.activeMemoryFile = null; },
    },
  };
}
