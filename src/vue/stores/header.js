import { reactive } from 'vue';

// Header state: the active Session's context shown in the terminal header.
export const header = reactive({
  headerSession: null,
  headerPtyTitle: null,
  headerShellProfile: null,
  headerAccount: null,
  headerAccounts: [],
});
