// The settings Feature's Bridge to the frozen legacy renderer. It writes the feature store
// rather than a component ref, so the panel reading the store can be a Dumb Component. It is
// installed as window.vueSettings; App.vue's openSettingsViewer, which also hides the vanilla
// main-area content, calls open() for the settings part of that transition.
export function createSettingsBridge(store) {
  return {
    open(scope, projectPath) {
      store.settingsScope = scope || 'global';
      store.settingsProjectPath = projectPath || null;
      store.settingsOpen = true;
    },
    close() {
      store.settingsOpen = false;
    },
  };
}
