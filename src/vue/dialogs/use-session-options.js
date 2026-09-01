import { ref } from 'vue';

// The launch options both the New Session and Resume Session dialogs collect.
export function useSessionOptions() {
  const mode = ref(null);
  const danger = ref(false);
  const chrome = ref(false);
  const preLaunch = ref('');
  const addDirs = ref('');

  function seed(effective) {
    mode.value = effective.permissionMode || null;
    danger.value = !!effective.dangerouslySkipPermissions;
    chrome.value = !!effective.chrome;
    preLaunch.value = effective.preLaunchCmd || '';
    addDirs.value = effective.addDirs || '';
  }

  function toOptions(effective) {
    const options = {};
    if (danger.value) options.dangerouslySkipPermissions = true;
    else if (mode.value) options.permissionMode = mode.value;
    if (chrome.value) options.chrome = true;
    if (preLaunch.value.trim()) options.preLaunchCmd = preLaunch.value.trim();
    options.addDirs = addDirs.value.trim();
    if (effective?.mcpEmulation === false) options.mcpEmulation = false;
    return options;
  }

  return { mode, danger, chrome, preLaunch, addDirs, seed, toOptions };
}
