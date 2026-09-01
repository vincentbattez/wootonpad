import { reactive } from 'vue';

// The Plans panel's state, written through window.vuePlans.
export const plansStore = reactive({
  plans: [],
  activePlan: null,
});
