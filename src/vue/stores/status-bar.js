import { reactive } from 'vue';

// The status bar's three text slots. Standalone feature store written through
// window.vueStatusBar; the auto-clear timers live in the bridge, not here.
export const statusBarStore = reactive({
  info: '',
  activity: '',
  activityClass: '',
  updater: '',
});
