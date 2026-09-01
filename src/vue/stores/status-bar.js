import { reactive } from 'vue';

// The status bar's three text slots, written through window.vueStatusBar.
export const statusBarStore = reactive({
  info: '',
  activity: '',
  activityClass: '',
  updater: '',
});
