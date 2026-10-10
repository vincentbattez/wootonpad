import { reactive } from 'vue';

// The hosts Feature store. One slice: the Remote Hosts the Accounts tab renders below the Local
// Host, their live reachability, and the in-flight / last result of each Test connection. The
// Container (the one hosts component that may touch the service layer) writes here off the
// preload IPC; a Dumb Component reads it only through the Container. There is no window.vue*
// Bridge because the frozen renderer never calls into hosts — the Container owns the IPC itself.
export const hostsStore = reactive({
  // The persisted Hosts, each with its Accounts (CONTEXT.md, Host / Account).
  hosts: [],
  // hostId → true (Reachable) | false (Unreachable) | undefined (not yet probed).
  reachability: {},
  // hostId → true while a Test connection is running.
  testing: {},
  // hostId → the last Test connection outcome { ok, step, message, command } | null.
  results: {},
});
