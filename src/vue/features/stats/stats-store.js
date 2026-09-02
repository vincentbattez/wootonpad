import { reactive } from 'vue';

// The Stats Feature store. The Bridge (window.vueStats) writes the request
// counters; the Container watches them, calls the service and writes stats/usage
// back, which the panel renders reactively. No panel setter reaches in imperatively.
export const statsStore = reactive({
  stats: null,   // the raw stats cache, or null before the first load
  usage: {},     // the rate-limit usage payload
  refreshing: false, // a full refresh (claude /stats) is in flight
  loadRequest: 0,       // bumped to ask the Container to (re)load, honouring its cache TTL
  invalidateRequest: 0, // bumped to ask the Container to drop its cache
});
