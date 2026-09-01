import { reactive } from 'vue';

// The Plans panel's state. A standalone feature store: app.js pushes into it
// through the plans bridge (window.vuePlans) and PlansApp reads it reactively.
// It is not part of the window.vueStore aggregate.
export const plansStore = reactive({
  plans: [],
  activePlan: null,
});
