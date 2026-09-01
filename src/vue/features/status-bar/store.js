import { reactive } from 'vue';

// The status bar's three text slots, filled by the feature bridge (window.vueStatusBar).
export const statusBarStore = reactive({
  info: '',
  activity: '',
  activityClass: '',
  updater: '',
});
