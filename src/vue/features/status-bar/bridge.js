// window.vueStatusBar: the three status-bar slots and their auto-clear timers.
// The bridge writes the feature store rather than a component ref; app.js is
// frozen, so these names and signatures are the contract.
export function createStatusBarBridge(store) {
  let activityTimer = null;
  let updaterTimer = null;
  return {
    setInfo(text) { store.info = text; },
    setActivity(text, type) {
      if (activityTimer) clearTimeout(activityTimer);
      store.activity = text;
      store.activityClass = type === 'done' ? 'status-done' : '';
      if (!text || type === 'done') {
        activityTimer = setTimeout(() => {
          store.activity = '';
          store.activityClass = '';
        }, type === 'done' ? 3000 : 0);
      }
    },
    setUpdater(text, duration) {
      if (updaterTimer) clearTimeout(updaterTimer);
      store.updater = text;
      if (duration) {
        updaterTimer = setTimeout(() => { store.updater = ''; }, duration);
      }
    },
  };
}
