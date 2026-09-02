// The accounts Feature's Bridge to the frozen legacy renderer. Every method writes the feature
// store rather than a component ref, so a panel reading the store can be a Dumb Component.
// `public/app.js` is frozen, so these names and signatures are the contract: it exposes them as
// window.vueAccounts (the Accounts panel) and window.vueAccountDropdown (the sidebar switcher).

// window.vueAccounts: the Accounts panel list, its active account and usage.
export function createAccountsBridge(store) {
  return {
    setAccounts(list, activeId) {
      store.accounts = list;
      if (activeId !== undefined) store.activeAccountId = activeId;
    },
    setActiveAccount(id) { store.activeAccountId = id; },
    setUsage(usage) { store.usage = { ...usage }; },
  };
}

// window.vueAccountDropdown: the sidebar account switcher. close() is one of its methods.
export function createAccountDropdownBridge(store) {
  return {
    setAccounts(list, activeId, usage) {
      store.accounts = list;
      if (activeId !== undefined) store.activeAccountId = activeId;
      if (usage !== undefined) store.usage = usage;
    },
    setActiveAccount(id) { store.activeAccountId = id; },
    setUsage(usage) { store.usage = { ...usage }; },
    close() { store.open = false; },
  };
}
